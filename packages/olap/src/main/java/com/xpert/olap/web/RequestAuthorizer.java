package com.xpert.olap.web;

import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Interface for objects that can authorize query requests incoming to the API.
 *
 */
public interface RequestAuthorizer {
	
	public static final String ALL_ACCESS_ROLE_NAME = RequestAuthorizer.class.getName() + "-All-Access";
	
	static final class RequestAuthorizationStatus {
		public boolean authorized;
		public String message;
		public String mondrianRole;
		public String token;
	}
	
	static final class AuthorizerUtil {
		
		private static final Log log = LogFactory.getLog(AuthorizerUtil.class);
		
		public static final Map<String, Map<String, String>> convertRoleConnectionJsonToMaps(String jsonFileName) throws Exception {
			
			ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
			Resource[] resources = resolver.getResources("classpath*:" + jsonFileName);
			
			ObjectMapper mapper = new ObjectMapper();
			TypeReference<Map<String, Map<String, String>>> typeRef = new TypeReference<Map<String, Map<String, String>>>() {};
			
			Map<String, Map<String, String>> ret = null;
			
			if (resources.length == 0) {
				log.warn("Role mapping file " + jsonFileName + " not found");
			} else if (resources.length > 1) {
				log.warn("Multiple role mapping files found with name " + jsonFileName + ", the last one read from the classpath will be used");
			}
			
			for (int i=0;i < resources.length && ret == null;i++) {
				Resource resource = resources[i];
				if (resource.exists()) {
					ret = mapper.readValue(resource.getInputStream(), typeRef);
				}
			}
			
			return ret;
			
		}
		
	}
	
	public RequestAuthorizationStatus authorizeRequest(HttpServletRequest request, String connectionName) throws Exception;

}
