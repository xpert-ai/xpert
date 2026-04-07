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

import org.olap4j.metadata.Measure;

/**
 * A wrapper around olap4j Measure objects, suitable for serialization via json.
 *
 */
public class MeasureWrapper implements Serializable {
	
	private static final long serialVersionUID = 8381804073662223438L;
	
	private String name;
	private String caption;
	private boolean visible;
	private boolean calculated;
	
	MeasureWrapper() {
	}
	
	public MeasureWrapper(Measure measure) {
		this.name = measure.getName();
		this.caption = measure.getCaption();
		this.visible = measure.isVisible();
		this.calculated = measure.isCalculated();
	}

	public String getName() {
		return name;
	}

	public String getCaption() {
		return caption;
	}

	public boolean isVisible() {
		return visible;
	}

	public boolean isCalculated() {
		return calculated;
	}

	void setName(String name) {
		this.name = name;
	}

	void setCaption(String caption) {
		this.caption = caption;
	}

	void setVisible(boolean visible) {
		this.visible = visible;
	}

	void setCalculated(boolean calculated) {
		this.calculated = calculated;
	}

}
