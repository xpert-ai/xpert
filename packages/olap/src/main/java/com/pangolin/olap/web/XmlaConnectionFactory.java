package com.pangolin.olap.web;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import com.pangolin.olap.mondrian.MondrianConnectionFactory;
import com.pangolin.olap.repository.ConnectionRepository;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.olap4j.OlapConnection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import mondrian.olap4j.MondrianOlap4jConnection;
import mondrian.xmla.XmlaHandler;


/**
 * Connection factory for the XmlaServlet that uses the MondrianServerProvider
 * to retrieve the currently running server.
 */
@Component
public class XmlaConnectionFactory implements XmlaHandler.ConnectionFactory {
    protected static final Logger LOGGER = LogManager.getLogger(XmlaConnectionFactory.class);
    // @Autowired
    // private MondrianConnectionFactory mondrianConnectionFactory;
    @Autowired
	private ConnectionRepository connectionRepository;

    @Override
    public OlapConnection getConnection(String catalog, String schema, String roleName, Properties props)
            throws SQLException {
        if (catalog == null) {
            return null;
        }

        MondrianOlap4jConnection olapConnection = connectionRepository.findById(catalog).get().getOlap4jConnection().unwrap(MondrianOlap4jConnection.class);
        
        if (roleName != null) {
            olapConnection.setRoleNames(List.of(roleName.split(",")));
        }

        return olapConnection;
    }

    @Override
    public Map<String, Object> getPreConfiguredDiscoverDatasourcesResponse() {
        return null;
    }

}
