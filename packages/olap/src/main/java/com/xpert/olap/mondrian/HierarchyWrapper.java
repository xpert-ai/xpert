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
 * Copyright 2018 Open Justice Broker Consortium and Cascadia Analytics LLC
 */
package com.xpert.olap.mondrian;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.olap4j.OlapException;
import org.olap4j.metadata.Hierarchy;
import org.olap4j.metadata.Level;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A wrapper around olap4j Hierarchy objects, suitable for serialization via json.
 *
 */
public class HierarchyWrapper implements Serializable {
	
	private static final long serialVersionUID = 6513035017849268043L;
	
	private String name;
	private String caption;
	private boolean hasAll;
	private List<LevelWrapper> levels;
	
	HierarchyWrapper() {
	}

	public HierarchyWrapper(Hierarchy h) throws OlapException {
		this.name = h.getName();
		this.caption = h.getCaption();
		this.hasAll = h.hasAll();
		levels = new ArrayList<>();
		for(Level level : h.getLevels()) {
			levels.add(new LevelWrapper(level));
		}
	}
	
	public String getName() {
		return name;
	}

	public String getCaption() {
		return caption;
	}
	
	@JsonProperty("hasAll")
	public boolean getHasAll() {
		return hasAll;
	}

	public List<LevelWrapper> getLevels() {
		return Collections.unmodifiableList(levels);
	}

	void setName(String name) {
		this.name = name;
	}

	void setCaption(String caption) {
		this.caption = caption;
	}
	
	void setHasAll(boolean hasAll) {
		this.hasAll = hasAll;
	}
	
	void setLevels(List<LevelWrapper> levels) {
		this.levels = levels;
	}

}
