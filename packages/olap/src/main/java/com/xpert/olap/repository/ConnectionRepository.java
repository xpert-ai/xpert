package com.xpert.olap.repository;

import org.springframework.stereotype.Repository;
import org.springframework.data.repository.CrudRepository;

@Repository
public interface ConnectionRepository extends CrudRepository<XmlaConnection, String> {
}
