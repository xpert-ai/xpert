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
import java.util.List;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.olap4j.Position;
import org.olap4j.metadata.Member;

/**
 * Class of assorted utility methods for dealing with the Mondrian object model.
 *
 */
public class MondrianUtils {
	
	private static final Log log = LogFactory.getLog(MondrianUtils.class);
	
	/**
	 * Get a string representation of the members within a position, suitable for debug trace etc.
	 * @param position the position to print
	 * @return a string containing the members of the position
	 */
	public static final String getMembersString(Position position) {
		log.debug("getMembersString");
		List<Member> members = position.getMembers();
		StringBuffer sb = new StringBuffer();
		sb.append("*");
		for (Member m : members) {
			sb.append(m.getDimension().getName()).append("=").append(m.getName()).append("|");
		}
		String sbs = sb.toString().substring(0, sb.length()-1);
		StringBuffer ret = new StringBuffer(sbs).append("*");
		return ret.toString();
	}
	
	public static final <T> List<List<T>> permuteLists(List<List<T>> lists) {
		List<List<T>> ret = new ArrayList<>();
		permuteLists(ret, new ArrayList<T>(), lists);
		return ret;
	}
	
	private static final <T> void permuteLists(List<List<T>> accum, List<T> current, List<List<T>> lists) {

		List<T> currentInputList = lists.get(current.size());

		for (T element : currentInputList) {
			List<T> copy = new ArrayList<>();
			copy.addAll(current);
			copy.add(element);
			if (copy.size() < lists.size()) {
				permuteLists(accum, copy, lists);
			} else {
				accum.add(copy);
			}
		}

	}

}
