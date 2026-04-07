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
import java.util.List;

import org.olap4j.OlapException;
import org.olap4j.metadata.Level;
import org.olap4j.metadata.Member;

/**
 * A wrapper around olap4j Level objects, suitable for serialization via json.
 *
 */
public class LevelWrapper implements Serializable {
	
	private static final long serialVersionUID = -5854141970363132112L;

	static final int CARDINALITY_LIMIT = Integer.MAX_VALUE;
	
	private String name;
	private String caption;
	private int depth;
	private int cardinality;
	private boolean populated;
	private List<MemberWrapper> members;
	
	LevelWrapper() {
	}

	public LevelWrapper(Level level) throws OlapException {
		this.name = level.getName();
		this.caption = level.getCaption();
		this.depth = level.getDepth();
		this.cardinality = level.getCardinality();
		members = new ArrayList<>();
		if (cardinality <= CARDINALITY_LIMIT) {
			populated = true;
			for(Member member : level.getMembers()) {
				members.add(new MemberWrapper(member));
			}
		} else {
			populated = false;
		}
	}

	public String getName() {
		return name;
	}

	public String getCaption() {
		return caption;
	}

	public int getDepth() {
		return depth;
	}

	public int getCardinality() {
		return cardinality;
	}

	public boolean isPopulated() {
		return populated;
	}

	public List<MemberWrapper> getMembers() {
		return members;
	}

	void setName(String name) {
		this.name = name;
	}

	void setCaption(String caption) {
		this.caption = caption;
	}

	void setDepth(int depth) {
		this.depth = depth;
	}

	void setCardinality(int cardinality) {
		this.cardinality = cardinality;
	}

	void setPopulated(boolean populated) {
		this.populated = populated;
	}

	void setMembers(List<MemberWrapper> members) {
		this.members = members;
	}
	
	

}
