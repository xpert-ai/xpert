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
package com.xpert.olap.web;

import java.util.Collections;
import java.util.Map;

/**
 * Simple DAO bean representing an MDX query to be submitted to a named connection.
 *
 */
public class QueryRequest {
	
	public static final class TidyConfig {
		@Override
		public int hashCode() {
			final int prime = 31;
			int result = 1;
			result = prime * result + (enabled ? 1231 : 1237);
			result = prime * result + ((levelNameTranslationMap == null) ? 0 : levelNameTranslationMap.hashCode());
			result = prime * result + (simplifyNames ? 1231 : 1237);
			return result;
		}
		@Override
		public boolean equals(Object obj) {
			return obj != null && obj instanceof TidyConfig && obj.hashCode() == hashCode();
		}
		private boolean enabled;
		private boolean simplifyNames;
		private Map<String, String> levelNameTranslationMap;
		public boolean isSimplifyNames() {
			return simplifyNames;
		}
		public void setSimplifyNames(boolean simplifyNames) {
			this.simplifyNames = simplifyNames;
		}
		public boolean isEnabled() {
			return enabled;
		}
		public void setEnabled(boolean enabled) {
			this.enabled = enabled;
		}
		public Map<String, String> getLevelNameTranslationMap() {
			return levelNameTranslationMap == null ? null : Collections.unmodifiableMap(levelNameTranslationMap);
		}
		public void setLevelNameTranslationMap(Map<String, String> dimensionNames) {
			this.levelNameTranslationMap = dimensionNames;
		}
	}
	
	private String connectionName;
	private String query;
	private TidyConfig tidy;
	private String mondrianRole;
	
	public String getMondrianRole() {
		return mondrianRole;
	}
	public void setMondrianRole(String mondrianRole) {
		this.mondrianRole = mondrianRole;
	}
	public String getConnectionName() {
		return connectionName;
	}
	public void setConnectionName(String connectionName) {
		this.connectionName = connectionName;
	}
	public String getQuery() {
		return query;
	}
	public void setQuery(String query) {
		this.query = query;
	}
	public TidyConfig getTidy() {
		return tidy;
	}
	public void setTidy(TidyConfig tidy) {
		this.tidy = tidy;
	}
	
	public int getCacheKey() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((connectionName == null) ? 0 : connectionName.hashCode());
		result = prime * result + ((query == null) ? 0 : query.hashCode());
		result = prime * result + ((tidy == null) ? 0 : tidy.hashCode());
		result = prime * result + ((mondrianRole == null) ? 0 : mondrianRole.hashCode());
		return result;
	}

}
