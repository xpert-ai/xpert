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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.olap4j.CellSetAxis;
import org.olap4j.Position;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A wrapper around Mondrian Axis objects, suitable for serialization via json.
 *
 */
public class AxisWrapper {
	
	private List<PositionWrapper> positionWrappers;
	
	private int ordinal;
	private String name;
	
	AxisWrapper() {
	}
	
	public AxisWrapper(CellSetAxis axis) {
		
		positionWrappers = new ArrayList<>();
		
		for (Position position : axis.getPositions()) {
			positionWrappers.add(new PositionWrapper(position));
		}
		
		ordinal = axis.getAxisOrdinal().axisOrdinal();
		name = axis.getAxisOrdinal().name();
		
	}
	
	@JsonProperty("positions")
	public List<PositionWrapper> getPositionWrappers() {
		return Collections.unmodifiableList(positionWrappers);
	}

	public int getOrdinal() {
		return ordinal;
	}

	public String getName() {
		return name;
	}

	void setPositionWrappers(List<PositionWrapper> positionWrappers) {
		this.positionWrappers = positionWrappers;
	}

	void setOrdinal(int ordinal) {
		this.ordinal = ordinal;
	}

	void setName(String name) {
		this.name = name;
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((name == null) ? 0 : name.hashCode());
		result = prime * result + ordinal;
		result = prime * result + ((positionWrappers == null) ? 0 : positionWrappers.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object obj) {
		return obj != null && obj instanceof AxisWrapper && obj.hashCode()==hashCode();
	}

}
