/*
 * Unless explicitly acquired and licensed from Licensor under another license, the contents of
 * this file are subject to the Reciprocal Public License ("RPL") Version 1.5, or subsequent
 * versions as allowed by the RPL, and You may not copy or use this file in either source code
 * or executable form, except in compliance with the terms and conditions of the RPL
 *
 * All software distributed under the RPL is provided strictly on an "AS IS" basis, WITHOUT
 * WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, AND LICENSOR HEREBY DISCLAIMS ALL SUCH
 * WARRANTIES, INCLUDING WITHOUT LIMITATION, ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE, QUIET ENJOYMENT, OR NON-INFRINGEMENT. See the RPL for specific language
 * governing rights and limitations under the RPL.
 *
 * http://opensource.org/licenses/RPL-1.5
 *
 * Copyright 2012-2017 Open Justice Broker Consortium
 */
package com.xpert.olap.mondrian;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.Charset;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

import javax.annotation.PostConstruct;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.apache.commons.io.IOUtils;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xpert.olap.repository.XmlaConnection;

/**
 * A factory object that creates olap4j connection objects from json specifications that it finds on the classpath.  Connections are instantiated lazily...that is, no
 * actual connection is made to the underlying relational database until getOlap4jConnection() is called.
 *
 */
// @Component
public class MondrianConnectionFactory {
	
	private final Log log = LogFactory.getLog(MondrianConnectionFactory.class);
	
	@Value("${removeDemoConnections}")
	private boolean removeDemoConnections;
	
	static final class MondrianConnectionCollection {
		private String sourceFilePath;
		private Map<String, XmlaConnection> connections;
		public Map<String, XmlaConnection> getConnections() {
			return Collections.unmodifiableMap(connections);
		}
		public String getSourceFilePath() {
			return sourceFilePath;
		}
	}
	
	// @JsonIgnoreProperties(ignoreUnknown = true)
	// @JsonInclude(Include.NON_NULL)
	// public static final class MondrianConnection {
		
	// 	private final Log log = LogFactory.getLog(MondrianConnection.class);
		
	// 	@JsonProperty("JdbcDriver")
	// 	private String jdbcDriver;
	// 	@JsonProperty("Jdbc")
	// 	private String jdbcConnectionString;
	// 	private String jdbcUser;
	// 	private String jdbcPassword;
	// 	@JsonProperty("Description")
	// 	private String description;
	// 	private String catalog;
	// 	private String resolvedMondrianSchemaURL;
	// 	private URL catalogUrl;
	// 	private String catalogContent;
	// 	private String sourceResourcePath;
	// 	private boolean isDemo = false;
	// 	private boolean jdbcDriverClass;
		
	// 	public boolean isJdbcDriverClass() {
	// 		return jdbcDriverClass;
	// 	}
	// 	@JsonProperty(value="JdbcDriverClass")
	// 	public void setJdbcDriverClass(boolean jdbcDriverClass) {
	// 		this.jdbcDriverClass = jdbcDriverClass;
	// 	}
	// 	public boolean getIsDemo() {
	// 		return isDemo;
	// 	}
	// 	@JsonProperty(value="IsDemo")
	// 	void setIsDemo(boolean value) {
	// 		isDemo=value;
	// 	}
	// 	@JsonProperty(value="ConnectionDefinitionSource")
	// 	public String getSourceResourcePath() {
	// 		return sourceResourcePath;
	// 	}
	// 	public String getJdbcDriver() {
	// 		return jdbcDriver;
	// 	}
	// 	public String getJdbcConnectionString() {
	// 		return jdbcConnectionString;
	// 	}
	// 	@JsonIgnore
	// 	public String getResolvedMondrianSchemaURL() {
	// 		return resolvedMondrianSchemaURL;
	// 	}
	// 	@JsonProperty(value="MondrianSchemaUrl")
	// 	public String getMondrianSchemaUrl() {
	// 		return getResolvedMondrianSchemaURL();
	// 	}
	// 	@JsonProperty(value="MondrianSchemaUrl")
	// 	@JsonIgnore
	// 	void setMondrianSchemaUrl(String value) {
	// 		resolvedMondrianSchemaURL=value;
	// 	}
	// 	public String getDescription() {
	// 		return description;
	// 	}
	// 	@JsonIgnore
	// 	public String getJdbcUser() {
	// 		return jdbcUser;
	// 	}
	// 	@JsonProperty(value="JdbcUser")
	// 	void setJdbcUser(String value) {
	// 		jdbcUser=value;
	// 	}
	// 	@JsonIgnore
	// 	public String getJdbcPassword() {
	// 		return jdbcPassword;
	// 	}
	// 	@JsonProperty(value="JdbcPassword")
	// 	void setJdbcPassword(String value) {
	// 		jdbcPassword=value;
	// 	}
	// 	@JsonProperty(value="MondrianSchemaContent")
	// 	public String getMondrianSchemaContent() {
	// 		return catalogContent;
	// 	}
	// 	@JsonIgnore
	// 	public String getCatalog() {
	// 		return catalog;
	// 	}
	// 	@JsonIgnore
	// 	public Document getMondrianSchemaContentDocument() throws SAXException, IOException, ParserConfigurationException {
	// 		return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new InputSource(new StringReader(catalogContent)));
	// 	}
		
	// 	@JsonProperty(value="Catalog")
	// 	void setCatalog(String path) {
	// 		if (path != null) {
	// 			catalogUrl = MondrianConnection.class.getResource(path);
	// 			if (catalogUrl == null) {
	// 				try {
	// 					catalogUrl = new URL(path);
	// 				} catch (MalformedURLException e) {
	// 					log.warn("Invalid URL specified for Mondrian schema: " + path);
	// 				}
	// 			}
	// 			if (catalogUrl != null) {
	// 				resolvedMondrianSchemaURL = catalogUrl.toExternalForm();
	// 				try {
	// 					InputStream stream = catalogUrl.openStream();
	// 					catalogContent = IOUtils.toString(stream, Charset.defaultCharset());
	// 				} catch (IOException e) {
	// 					log.warn("Exception occurred when attempting to read Mondrian schema from URL " + catalogUrl.toExternalForm());
	// 				}
	// 			}
	// 		}
	// 		catalog = path;
	// 	}

	// 	/**
	// 	 * Get the olap4j connection for the parameters represented by this MondrianConnection
	// 	 * @return the connection object
	// 	 * @throws SQLException if something goes wrong with the underlying connection to the relational database
	// 	 */
	// 	@JsonIgnore
	// 	public java.sql.Connection getOlap4jConnection() throws SQLException {
			
	// 		try {
	// 			Class.forName("mondrian.olap4j.MondrianOlap4jDriver");
	// 		} catch (ClassNotFoundException e) {
	// 			log.error("Mondrian olap4j driver class not found.  Mondrian appears to be missing or improperly installed.");
	// 			throw new RuntimeException(e);
	// 		}
			
	// 		Properties props = new Properties();
	// 		setPropertyValue(props, "Jdbc", jdbcConnectionString);
	// 		setPropertyValue(props, "JdbcDrivers", jdbcDriver);
	// 		setPropertyValue(props, "CatalogContent", catalogContent);
	// 		setPropertyValue(props, "JdbcUser", jdbcUser);
	// 		setPropertyValue(props, "JdbcPassword", jdbcPassword);

	// 		return DriverManager.getConnection("jdbc:mondrian:", props);

	// 	}
		
	// 	boolean validate() {
	// 		boolean ret = true;
	// 		if (jdbcConnectionString == null) {
	// 			log.warn("JDBC Connection String (specified by json property \"Jdbc\") is null");
	// 			ret = false;
	// 		}
	// 		if (jdbcDriver == null) {
	// 			log.warn("JDBC Driver (specified by json property \"JdbcDriver\") is null");
	// 			ret = false;
	// 		}
	// 		if (catalog == null) {
	// 			log.warn("Mondrian Schema/Catalog (specified by json property \"Catalog\") is null");
	// 			ret = false;
	// 		}
	// 		if (catalogContent == null) {
	// 			log.warn("Mondrian Schema content (read from catalog URL) is null");
	// 			ret = false;
	// 		}
	// 		return ret;
	// 	}
		
	// 	private static final Properties setPropertyValue(Properties props, String name, String value) {
	// 		if (value != null) {
	// 			props.setProperty(name, value);
	// 		}
	// 		return props;
	// 	}
		
	// }
	
	private List<MondrianConnectionCollection> connectionCollections = new ArrayList<>();
	private Map<String, XmlaConnection> connections = new HashMap<>();

	/**
	 * Initialize the factory by scanning the classpath for resources matching the pattern *mondrian-connections.json.
	 * @throws IOException if something goes wrong scanning the classpath or reading resources
	 */
	@PostConstruct
	public void init() throws IOException  {
		// init(removeDemoConnections);
	}
	
	/**
	 * Initialize the factory by scanning the classpath for resources matching the pattern *mondrian-connections.json.
	 * @param removeDemoConnections whether to strip out connections where IsDemo=true
	 * @throws IOException if something goes wrong scanning the classpath or reading resources
	 */
	public void init(boolean removeDemoConnections) throws IOException  {
		
		ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
		Resource[] resources = resolver.getResources("classpath*:*mondrian-connections.json");
		
		ObjectMapper mapper = new ObjectMapper();
		TypeReference<Map<String, XmlaConnection>> typeRef = new TypeReference<Map<String, XmlaConnection>>() {};
		
		for (Resource resource : resources) {
			String resourceSourcePath = null;
			String url = resource.getURL().toExternalForm();
			if (url.contains("/WEB-INF/classes!/")) {
				resourceSourcePath = url.replace("/WEB-INF/classes!/", "/WEB-INF/classes/");
				log.info("Working around Spring Boot / Tomcat bug that occurs in standalone mode, to adjust file path found via PathMatchingResourcePatternResolver");
			} else {
				resourceSourcePath = resource.getFile().getCanonicalPath();
			}
			log.info("Processing connection definition json found at " + resourceSourcePath);

			Map<String, XmlaConnection> connections = mapper.readValue(resource.getInputStream(), typeRef);
			Set<String> invalidConnections = new HashSet<>();
			for (String nm : connections.keySet()) {
				XmlaConnection c = connections.get(nm);
				if (!c.validate()) {
					log.warn("Ignoring connection " + nm + " due to invalid/missing properties (see prior messages for details)");
					invalidConnections.add(nm);
				} else {
					log.info("Adding valid connection " + nm + ": connection string=" + c.getJdbcConnectionString() + ", Mondrian schema path=" + c.getResolvedMondrianSchemaURL());
					c.sourceResourcePath = resourceSourcePath;
				}
			}
			for (String nm : invalidConnections) {
				connections.remove(nm);
			}
			MondrianConnectionCollection collection = new MondrianConnectionCollection();
			collection.connections = connections;
			collection.sourceFilePath = resourceSourcePath;
			connectionCollections.add(collection);
		}
		
		Collections.reverse(connectionCollections);
		
		for (MondrianConnectionCollection mcc : connectionCollections) {
			Map<String, XmlaConnection> c = mcc.getConnections();
			for (String name : c.keySet()) {
				if (connections.containsKey(name)) {
					XmlaConnection conn = connections.get(name);
					log.warn("Overriding connection " + name + " defined at " + conn.getSourceResourcePath() +
							" with connection defined \"higher\" on the classpath, at " + c.get(name).getSourceResourcePath());
				}
				XmlaConnection mc = c.get(name);
				if (mc != null && (!removeDemoConnections || !mc.getIsDemo())) {
					connections.put(name, mc);
				} else if (mc != null) {
					log.info("Removing demo connection " + name + " with description '" + mc.getDescription() + "' defined at " + mc.getSourceResourcePath());
				} else {
					// this should never happen, but just in case...
					log.warn("Connection defined with name " + name + " but no available definition on classpath");
				}
			}
		}
		
	}
	
	List<MondrianConnectionCollection> getConnectionCollections() {
		return Collections.unmodifiableList(connectionCollections);
	}
	
	/**
	 * Get the collection of available Mondrian Connection objects in this factory.  The key in the map is the name of the connection, as specified in the .json.  The value
	 * in the map is the connection object.
	 * @return the map of connections
	 */
	public Map<String, XmlaConnection> getConnections() {
		return Collections.unmodifiableMap(connections);
	}

}
