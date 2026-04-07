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
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.olap4j.Cell;
import org.olap4j.CellSet;
import org.olap4j.CellSetAxis;
import org.olap4j.Position;
import org.olap4j.metadata.Level;
import org.olap4j.metadata.Member;
import org.olap4j.metadata.Member.Type;

/**
 * Wrapper object for tidied cell sets.
 *
 */
public class TidyCellSetWrapper implements CellSetWrapperType {
	
	private static final String MEASURES_LEVEL_UNIQUE_NAME = "[Measures].[MeasuresLevel]";
	private static final String HASH_KEY = ".H";
	private static final String ORDER_KEY = ".O";
	
	private final Log log = LogFactory.getLog(TidyCellSetWrapper.class);
	
	private List<Map<String, Object>> values = new ArrayList<>();
	
	/**
	 * Initialize this wrapper
	 * @param cellSet the olap4j cell set to wrap
	 * @param simplifyNames whether to simplify names or not (i.e., remove higher dimension qualifiers)
	 * @param dimensionNameTranslationMap a map to use in creating custom names from the original names in the cell set
	 */
	public void init(CellSet cellSet, boolean simplifyNames, Map<String, String> dimensionNameTranslationMap) {
		
		log.debug("Start of init");
		
		List<Map<String, Object>> positionIntersectionList = buildPositionIntersectionList(cellSet);
		values = reducePositionIntersectionList(positionIntersectionList);
		
		if (dimensionNameTranslationMap == null) {
			dimensionNameTranslationMap = new HashMap<>();
		}
		
		if (simplifyNames) {
			List<Map<String, Object>> newValues = new ArrayList<>();
			for (Map<String, Object> rowMap : values) {
				Map<String, Object> translatedMap = new HashMap<>();
				for (String key : rowMap.keySet()) {
					String value = dimensionNameTranslationMap.get(key);
					if (value == null) {
						value = getLevelNameForUniqueName(cellSet, key);
					}
					translatedMap.put(value, rowMap.get(key));
				}
				newValues.add(translatedMap);
			}
			values = newValues;
		}
		
	}

	private String getLevelNameForUniqueName(CellSet cellSet, String levelUniqueName) {
		List<CellSetAxis> axes = cellSet.getAxes();
		for (CellSetAxis axis : axes) {
			for (Position position : axis.getPositions()) {
				for (Member member : position.getMembers()) {
					Member m = member;
					while (m != null) {
						if (m.getMemberType() != Type.ALL) {
							Level level = m.getLevel();
							if (level.getUniqueName().equals(levelUniqueName)) {
								return level.getName();
							}
						}
						m = m.getParentMember();
					}
				}
			}
		}
		return levelUniqueName;
	}

	public void init(CellSet cellSet) {
		init(cellSet, false, null);
	}

	private List<Map<String, Object>> reducePositionIntersectionList(List<Map<String, Object>> positionIntersectionList) {
		
		Map<Object, Map<String, Object>> reducedMap = new HashMap<>();
		
		for (int i=0;i < positionIntersectionList.size();i++) {
			Map<String, Object> map = positionIntersectionList.get(i);
			Object hashKey = map.get(HASH_KEY);
			if (reducedMap.containsKey(hashKey)) {
				String measureName = (String) map.get(MEASURES_LEVEL_UNIQUE_NAME);
				reducedMap.get(hashKey).put(measureName, map.get(measureName));
			} else {
				map.remove(MEASURES_LEVEL_UNIQUE_NAME);
				reducedMap.put(hashKey, map);
			}
		}
		
		List<Map<String, Object>> ret = new ArrayList<>();
		ret.addAll(reducedMap.values());
		ret.sort(new Comparator<Map<String, Object>>() {
			@SuppressWarnings("unchecked")
			@Override
			public int compare(Map<String, Object> o1, Map<String, Object> o2) {
				return ((Comparable<Integer>) o1.get(ORDER_KEY)).compareTo((Integer) o2.get(ORDER_KEY));
			}
		});
		
		for (Map<String, Object> row : ret) {
			row.remove(HASH_KEY);
			row.remove(ORDER_KEY);
		}
		
		return ret;
		
	}

	private List<Map<String, Object>> buildPositionIntersectionList(CellSet cellSet) {
		
		List<Map<String, Object>> ret = new ArrayList<>();
		
		List<CellSetAxis> axes = cellSet.getAxes();
		List<List<Position>> positionLists = new ArrayList<>();
		for (CellSetAxis axis : axes) {
			positionLists.add(axis.getPositions());
		}
		
		positionLists = MondrianUtils.permuteLists(positionLists);
		
		int valueIndex = 0;
		for (List<Position> positionList : positionLists) {
			
			Cell cell = cellSet.getCell(positionList.toArray(new Position[0]));
			Map<String, Object> map = new HashMap<>();
			
			for (Position position : positionList) {
				List<Member> members = position.getMembers();
				for (Member member : members) {
					map.putAll(getHierarchyMap(member));
				}
			}
			
			String measureValue = (String) map.get(MEASURES_LEVEL_UNIQUE_NAME);
			map.remove(MEASURES_LEVEL_UNIQUE_NAME);
			map.put(HASH_KEY, map.hashCode());
			map.put(MEASURES_LEVEL_UNIQUE_NAME, measureValue);

			map.put(measureValue, cell.getValue());
			map.put(ORDER_KEY, valueIndex++);
			ret.add(map);
			
		}
		
		return ret;
		
	}
	
	private Map<String, String> getHierarchyMap(Member member) {
		Map<String, String> ret = new HashMap<>();
		Member m = member;
		while (m != null) {
			if (m.getMemberType() != Type.ALL) {
				String uniqueName = m.getLevel().getUniqueName();
				String value = m.getName();
				ret.put(uniqueName, value);
			}
			m = m.getParentMember();
		}
		return ret;
	}
	
	public List<Map<String, Object>> getValues() {
		return Collections.unmodifiableList(values);
	}
	
}
