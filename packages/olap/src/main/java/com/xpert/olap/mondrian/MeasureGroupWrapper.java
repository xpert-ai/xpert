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

public class MeasureGroupWrapper {

	private String name;
	private List<String> measureReferences;
	private List<String> dimensionReferences;

	public MeasureGroupWrapper() {
		measureReferences = new ArrayList<String>();
		dimensionReferences = new ArrayList<String>();
	}

	public String getName() {
		return name;
	}

	void setName(String name) {
		this.name = name;
	}

	public List<String> getMeasureReferences() {
		return Collections.unmodifiableList(measureReferences);
	}

	void setMeasureReferences(List<String> measureReferences) {
		this.measureReferences = measureReferences;
	}

	public List<String> getDimensionReferences() {
		return Collections.unmodifiableList(dimensionReferences);
	}

	void setDimensionReferences(List<String> dimensionReferences) {
		this.dimensionReferences = dimensionReferences;
	}

}
