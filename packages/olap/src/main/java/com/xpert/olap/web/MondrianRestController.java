package com.xpert.olap.web;

import java.io.File;
import java.io.IOException;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Optional;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import javax.xml.parsers.ParserConfigurationException;

import org.apache.commons.io.FileUtils;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.ehcache.Cache;
import org.ehcache.CacheManager;
import org.ehcache.config.builders.CacheConfigurationBuilder;
import org.ehcache.config.builders.CacheManagerBuilder;
import org.ehcache.config.builders.ResourcePoolsBuilder;
import org.ehcache.config.units.MemoryUnit;
import com.xpert.olap.mondrian.CellSetWrapper;
import com.xpert.olap.mondrian.CellSetWrapperType;
import com.xpert.olap.mondrian.MondrianConnectionFactory;
import com.xpert.olap.mondrian.SchemaWrapper;
import com.xpert.olap.mondrian.TidyCellSetWrapper;
import com.xpert.olap.repository.XmlaConnection;
import com.xpert.olap.repository.ConnectionRepository;
import org.olap4j.CellSet;
import org.olap4j.OlapConnection;
import org.olap4j.OlapException;
import org.olap4j.OlapStatement;
import org.olap4j.metadata.Schema;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.xml.sax.SAXException;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;

import mondrian.server.MondrianServerRegistry;

/**
 * REST API for interacting with Mondrian.
 *
 */
// @RestController
public class MondrianRestController {
	
	private final Log log = LogFactory.getLog(MondrianRestController.class);
	private MondrianConnectionFactory connectionFactory;
	private Cache<Integer, CellSetWrapperType> queryCache;
	private Cache<Integer, SchemaWrapper> metadataCache;

	@Autowired
	private ConnectionRepository connectionRepository;
	
   	@Resource(name="${requestAuthorizerBeanName}")
	private RequestAuthorizer requestAuthorizer;
   	
	@Value("${removeDemoConnections}")
	private boolean removeDemoConnections;
	
	@Value("${preCacheMetadata:false}")
	private String preCacheMetadata;
	
	@Value("${queryTimeout:#{null}}")
	private Integer queryTimeout;
	
	@Value("${cacheDiskLocation:/tmp}")
	private String cacheDiskLocation;
	
	@Value("${queryCacheSizeEntries:#{500}}")
	private int queryCacheSizeEntries;
	
	@Value("${metadataCacheHeapTierEntries:#{20}}")
	private int metadataCacheHeapTierEntries;
	
	@Value("${metadataCacheDiskTierSize:#{500}}")
	private int metadataCacheDiskTierSize;

	@Bean
    public static PropertySourcesPlaceholderConfigurer propertyConfigInDev() {
        return new PropertySourcesPlaceholderConfigurer();
    }
	
	@PostConstruct
	public void init() throws Exception {
		log.info("Initializing controller, Mondrian version is: " + MondrianServerRegistry.INSTANCE.getVersion().getVersionString());
		log.info(queryTimeout == null ? "No query timeout specified" : ("Queries will time out after " + queryTimeout + " seconds"));
		connectionFactory = new MondrianConnectionFactory();
		connectionFactory.init(removeDemoConnections);
		initCache();
		log.info("Successfully registered request authorizer class " + requestAuthorizer.getClass().getName());
		boolean pcm = false;
		Set<String> connectionNames = null;
		preCacheMetadata = preCacheMetadata.trim();
		if (!("false".equals(preCacheMetadata))) {
			pcm = true;
			if (!("true".equals(preCacheMetadata))) {
				connectionNames = new HashSet<>();
				for (String s : preCacheMetadata.split(",")) {
					connectionNames.add(s);
				}
			}
		}
		if (pcm) {
			if (connectionNames == null) {
				connectionNames = connectionFactory.getConnections().keySet();
			} else {
				Set<String> allConnections = connectionFactory.getConnections().keySet();
				allConnections.retainAll(connectionNames);
				connectionNames = allConnections;
				if (connectionNames.isEmpty()) {
					log.warn("All connections were removed from the pre-cache list, so no pre-caching of metadata will be performed. To pre-cache all connections, set preCacheMetadata application property to true.");
				}
			}
			for (String connectionName : connectionFactory.getConnections().keySet()) {
				log.info("Pre-caching metadata for connection " + connectionName);
				XmlaConnection connection = connectionFactory.getConnections().get(connectionName);
				OlapConnection olapConnection = connection.getOlap4jConnection().unwrap(OlapConnection.class);
				List<String> roles = olapConnection.getAvailableRoleNames();
				new Thread(new Runnable() {
					@Override
					public void run() {
						try {
							fetchMetadata(connectionName, null, connection);
							for (String role : roles) {
								fetchMetadata(connectionName, role, connection);
							}
						} catch(Exception e) {
							throw new RuntimeException(e);
						}
					}
				}).start();
			}
		}
	}

	/**
	 * Get all the connections available to this instance of the API
	 * @return json string with connection information
	 * @throws Exception
	 */
	@RequestMapping(value="/getConnections", method=RequestMethod.GET, produces="application/json")
	public String getConnections() throws Exception {
		ObjectMapper objectMapper = new ObjectMapper();
		objectMapper.addMixIn(XmlaConnection.class, SchemaContentHidingMixIn.class);

		// connectionRepository.deleteAll();

		// Map<String, XmlaConnection> connections = connectionFactory.getConnections();
		// for (Map.Entry<String, XmlaConnection> entry : connections.entrySet()) {
		// 	System.out.println(entry.getKey() + ":" + entry.getValue());
		// 	XmlaConnection connection = entry.getValue();
		// 	connection.name = entry.getKey();
		// 	connectionRepository.save(connection);
		// }
		return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(connectionRepository.findAll());
		// return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(connectionFactory.getConnections());
	}
	
	/**
	 * Get the Mondrian schema XML for the specified connection.  Sets HTTP Status of 500 if the specified connection does not exist.
	 * @param connectionName the connection to search for
	 * @return the specified connection's Mondrian schema (as XML), or null if not found
	 * @throws Exception
	 */
	@RequestMapping(value="/getSchema", method=RequestMethod.GET, produces="application/xml")
	public ResponseEntity<String> getSchema(String connectionName) throws Exception {
		
		String body = null;
		HttpStatus status = HttpStatus.OK;
		
		Optional<XmlaConnection> connection = connectionRepository.findById(connectionName); // connectionFactory.getConnections().get(connectionName);
		if (connection == null) {
			log.warn("Attempt to retrieve schema for connection that does not exist: " + connectionName);
			status = HttpStatus.NOT_FOUND;
		} else {
			log.info("Retrieving schema content for connection " + connectionName);
			body = connection.get().getCatalogContent();
			// body = schemaContent.replace("\\n", "\n");
		}
		
		return new ResponseEntity<String>(body, status);
		
	}
	
	/**
	 * Flush the query cache
	 */
	@RequestMapping(value="/flushCache", method=RequestMethod.GET)
	public ResponseEntity<Void> flushCache() {
		queryCache.clear();
		log.info("Query cache flushed");
		metadataCache.clear();
		log.info("Metadata cache flushed");
		return new ResponseEntity<Void>(HttpStatus.OK);
	}
	
	@RequestMapping(value="/getMetadata", method=RequestMethod.GET, produces="application/json")
	public ResponseEntity<String> getMetadata(String connectionName, HttpServletRequest request) throws Exception {
		
		RequestAuthorizer.RequestAuthorizationStatus authorizationStatus = requestAuthorizer.authorizeRequest(request, connectionName);
		
		if (authorizationStatus.authorized) {
			
			String mondrianRole = authorizationStatus.mondrianRole;

			String body = null;
			HttpStatus status = HttpStatus.OK;
			HttpHeaders responseHeaders = new HttpHeaders();

			// XmlaConnection connection = connectionFactory.getConnections().get(connectionName);
			XmlaConnection connection = connectionRepository.findById(connectionName).orElseThrow();

			if (connection == null) {
				log.warn("Attempt to retrieve metadata for connection that does not exist: " + connectionName);
				status = HttpStatus.NOT_FOUND;
			} else {
				ObjectMapper mapper = new ObjectMapper();
				try {
					SchemaWrapper schemaWrapper = null;
					int metadataCacheKey = getMetadataCacheKey(connectionName, mondrianRole);
					if (metadataCache.containsKey(metadataCacheKey)) {
						schemaWrapper = metadataCache.get(metadataCacheKey);
						responseHeaders.add("mondrian-rest-cached-result", "true");
					} else {
						schemaWrapper = fetchMetadata(connectionName, mondrianRole, connection);
					}
					body = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(schemaWrapper);
				} catch (OlapException oe) {
					log.warn("OlapException occurred retrieving metadata.  Stack trace follows (if debug logging).");
					log.debug("Stack trace: ", oe);
					Map<String, String> errorBodyMap = new HashMap<>();
					errorBodyMap.put("reason", oe.getMessage());
					Throwable rootCause = oe;
					Throwable nextCause = oe.getCause();
					while (nextCause != null) {
						rootCause = nextCause;
						nextCause = rootCause.getCause();
					}
					errorBodyMap.put("rootCauseReason", rootCause.getMessage());
					errorBodyMap.put("SQLState", oe.getSQLState());
					log.warn("Exception root cause: " + rootCause.getMessage());
					body = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(errorBodyMap);
					status = HttpStatus.valueOf(500);
				}
			}

			return new ResponseEntity<String>(body, responseHeaders, status);
			
		} else {
			
			log.warn(authorizationStatus.message);
			return new ResponseEntity<>(HttpStatus.FORBIDDEN);
			
		}
		
	}

	private SchemaWrapper fetchMetadata(String connectionName, String mondrianRole, XmlaConnection connection) throws SQLException, OlapException, SAXException, IOException, ParserConfigurationException {

		long startTime = System.currentTimeMillis();
		log.info("Fetching metadata for connection " + connectionName + " and role " + mondrianRole);

		OlapConnection olapConnection = connection.getOlap4jConnection().unwrap(OlapConnection.class);

		if (mondrianRole != null) {
			olapConnection.setRoleName(mondrianRole);
		}

		Schema schema = olapConnection.getOlapSchema();
		SchemaWrapper schemaWrapper = new SchemaWrapper(schema, connectionName, connection.getMondrianSchemaContentDocument());

		int key = getMetadataCacheKey(connectionName, mondrianRole);

		metadataCache.put(key, schemaWrapper);
		
		log.info("Metadata fetch for connection " + connectionName + " and role " + mondrianRole + " finished in " + ((System.currentTimeMillis() - startTime)/1000.0) + " seconds.");
		
		return schemaWrapper;

	}

	private int getMetadataCacheKey(String connectionName, String mondrianRole) {
		int prime = 31;
		int key = 1;
		key = prime * key + ((mondrianRole == null) ? 0 : mondrianRole.hashCode());
		key = prime * key + ((connectionName == null) ? 0 : connectionName.hashCode());
		return key;
	}
	
	/**
	 * Submit the specified MDX query to the specified Mondrian connection.  Sets HTTP Status of 500 if the specified connection does not exist or if the query syntax is invalid.
	 * @param queryRequest the query request (specifies the connection, by name, and the MDX query string)
	 * @return json string containing the resulting CellSet, or null if no results
	 * @throws Exception
	 */
	@RequestMapping(value="/query", method=RequestMethod.POST, produces="application/json", consumes="application/json")
	public ResponseEntity<String> query(@RequestBody QueryRequest queryRequest, HttpServletRequest request) throws Exception {
		
		RequestAuthorizer.RequestAuthorizationStatus authorizationStatus = requestAuthorizer.authorizeRequest(request, queryRequest.getConnectionName());
		
		if (authorizationStatus.authorized) {

			boolean tidy = false;
			boolean simplifyNames = false;
			String body = null;
			HttpStatus status = HttpStatus.OK;
			HttpHeaders responseHeaders = new HttpHeaders();

			String connectionName = queryRequest.getConnectionName();

			Map<String, String> levelNameTranslationMap = null;
			QueryRequest.TidyConfig tidyConfig = queryRequest.getTidy();
			if (tidyConfig != null) {
				tidy = tidyConfig.isEnabled();
				simplifyNames = tidyConfig.isSimplifyNames();
				levelNameTranslationMap = tidyConfig.getLevelNameTranslationMap();
				if (simplifyNames && !tidy) {
					log.warn(
							"Request for simplification of names, but tidy is false.  No simplification is performed on raw CellSetWrappers.");
				}
			}

			// XmlaConnection connection = connectionFactory.getConnections()
			// 		.get(connectionName);
			XmlaConnection connection = connectionRepository.findById(connectionName).orElseThrow();
			ObjectMapper mapper = new ObjectMapper();

			if (connection == null) {

				String missingConnectionErrorMessage = "Query submitted for connection that does not exist: " + connectionName;
				log.warn(missingConnectionErrorMessage);
				status = HttpStatus.NOT_FOUND;
				body = "{\"message\" : \"" + missingConnectionErrorMessage + "\"}";

			} else {

				String query = queryRequest.getQuery();
				String mondrianRoleName = authorizationStatus.mondrianRole;
				queryRequest.setMondrianRole(mondrianRoleName);

				log.info("Token " + authorizationStatus.token + " with role " + mondrianRoleName +
						" executing query on connection " + connectionName + " with tidy=" + tidy + ": " + query);

				CellSetWrapperType outputObject = null;
				boolean querySucceeded = false;

				int cacheKey = queryRequest.getCacheKey();

				if (queryCache.containsKey(cacheKey)) {

					outputObject = queryCache.get(cacheKey);
					responseHeaders.add("mondrian-rest-cached-result", "true");
					log.info("Retrieved query result from cache");
					querySucceeded = true;

				} else {

					OlapConnection olapConnection = connection.getOlap4jConnection().unwrap(OlapConnection.class);
					try {
						if (mondrianRoleName != null) {
							olapConnection.setRoleName(mondrianRoleName);
						}
						OlapStatement statement = olapConnection.createStatement();
						if (queryTimeout != null) {
							statement.setQueryTimeout(queryTimeout);
						}
						try {
							CellSet cellSet = statement.executeOlapQuery(query);
							log.debug("Query succeeded");
							if (tidy) {
								TidyCellSetWrapper tcc = new TidyCellSetWrapper();
								tcc.init(cellSet, simplifyNames, levelNameTranslationMap);
								outputObject = tcc;
							} else {
								outputObject = new CellSetWrapper(cellSet);
							}
							queryCache.put(cacheKey, outputObject);
							querySucceeded = true;
						} catch (OlapException oe) {
							log.warn("OlapException occurred processing query.  Stack trace follows (if debug logging).");
							log.debug("Stack trace: ", oe);
							Map<String, String> errorBodyMap = new HashMap<>();
							errorBodyMap.put("reason", oe.getMessage());
							Throwable rootCause = oe;
							Throwable nextCause = oe.getCause();
							while (nextCause != null) {
								rootCause = nextCause;
								nextCause = rootCause.getCause();
							}
							errorBodyMap.put("rootCauseReason", rootCause.getMessage());
							errorBodyMap.put("SQLState", oe.getSQLState());
							log.warn("Exception root cause: " + rootCause.getMessage());
							body = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(errorBodyMap);
							status = HttpStatus.valueOf(500);
						} finally {
							statement.close();
						}
					} finally {
						olapConnection.close();
					}

				}

				if (querySucceeded) {
					body = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(outputObject);
				}

			}

			return new ResponseEntity<String>(body, responseHeaders, status);

		} else {
			
			log.warn(authorizationStatus.message);
			return new ResponseEntity<>(HttpStatus.FORBIDDEN);
			
		}
		
	}
	
	static final class SchemaContentHidingMixIn {
		@JsonIgnore
		@JsonProperty("MondrianSchemaContent")
		public String getMondrianSchemaContent() {
			return null;
		}
	}

	public void setRemoveDemoConnections(boolean removeDemoConnections) {
		this.removeDemoConnections = removeDemoConnections;
	}

	private void initCache() throws IOException {
		File cacheDir = new File(cacheDiskLocation, "mondrian-rest-object-cache");
		if (cacheDir.exists()) {
			FileUtils.deleteDirectory(cacheDir);
		}
		CacheManager cacheManager = CacheManagerBuilder.newCacheManagerBuilder()
				.with(CacheManagerBuilder.persistence(cacheDir))
				.withCache("query-cache",
						CacheConfigurationBuilder.newCacheConfigurationBuilder(Integer.class, CellSetWrapperType.class, ResourcePoolsBuilder.heap(queryCacheSizeEntries)))
				.withCache("metadata-cache",
						CacheConfigurationBuilder.newCacheConfigurationBuilder(Integer.class, SchemaWrapper.class,
								ResourcePoolsBuilder.heap(metadataCacheHeapTierEntries).disk(metadataCacheDiskTierSize, MemoryUnit.MB)))
				.build();
		cacheManager.init();
		queryCache = cacheManager.getCache("query-cache", Integer.class, CellSetWrapperType.class);
		metadataCache = cacheManager.getCache("metadata-cache", Integer.class, SchemaWrapper.class);
	}
	
}
