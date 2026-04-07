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

import org.olap4j.CellSet;
import org.olap4j.CellSetAxis;
import org.olap4j.Position;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A wrapper around Mondrian CellSet objects, suitable for serialization via json.
 *
 */
public class CellSetWrapper implements CellSetWrapperType {
	
	@JsonProperty("cells")
	private List<CellWrapper> cellWrappers;
	
	@JsonProperty("axes")
	private List<AxisWrapper> axisWrappers;
	
	CellSetWrapper() {
		
	}
	
	public CellSetWrapper(CellSet cellSet) {
		
		cellWrappers = new ArrayList<>();
		axisWrappers = new ArrayList<>();
		
		List<CellSetAxis> axes = cellSet.getAxes();
		
		int totalCellCount = 1;
		
		for (CellSetAxis axis : axes) {
			axisWrappers.add(new AxisWrapper(axis));
			List<Position> positions = axis.getPositions();
			totalCellCount *= positions.size();
		}
		
		for (int i=0;i < totalCellCount;i++) {
			cellWrappers.add(new CellWrapper(cellSet.getCell(i)));
		}
		
	}
	
	public List<CellWrapper> getCellWrappers() {
		return Collections.unmodifiableList(cellWrappers);
	}

	public List<AxisWrapper> getAxisWrappers() {
		return Collections.unmodifiableList(axisWrappers);
	}

	void setCellWrappers(List<CellWrapper> cellWrappers) {
		this.cellWrappers = cellWrappers;
	}

	void setAxisWrappers(List<AxisWrapper> axisWrappers) {
		this.axisWrappers = axisWrappers;
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((axisWrappers == null) ? 0 : axisWrappers.hashCode());
		result = prime * result + ((cellWrappers == null) ? 0 : cellWrappers.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object obj) {
		return obj != null && obj instanceof CellSetWrapper && obj.hashCode()==hashCode();
	}

}
