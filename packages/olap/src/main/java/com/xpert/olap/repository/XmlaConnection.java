package com.xpert.olap.repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.Charset;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.annotation.JsonProperty;

import org.apache.commons.io.IOUtils;
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.data.redis.core.index.Indexed;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

@RedisHash("XmlaConnection")
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(Include.NON_NULL)
public class XmlaConnection {

    @Id
    @Indexed
    public String id;

    @JsonProperty("JdbcDriver")
    private String jdbcDriver;
    @JsonProperty("Jdbc")
    private String jdbcConnectionString;
    private String jdbcUser;
    private String jdbcPassword;
    @JsonProperty("Description")
    private String description;
    private String catalog;
    private String resolvedMondrianSchemaURL;
    // private URL catalogUrl;
    private String catalogContent;
    public String sourceResourcePath;
    private boolean isDemo = false;
    private boolean jdbcDriverClass;

    public boolean isJdbcDriverClass() {
        return jdbcDriverClass;
    }

    @JsonProperty(value = "JdbcDriverClass")
    public void setJdbcDriverClass(boolean jdbcDriverClass) {
        this.jdbcDriverClass = jdbcDriverClass;
    }

    public boolean getIsDemo() {
        return isDemo;
    }

    @JsonProperty(value = "IsDemo")
    void setIsDemo(boolean value) {
        isDemo = value;
    }

    @JsonProperty(value = "ConnectionDefinitionSource")
    public String getSourceResourcePath() {
        return sourceResourcePath;
    }

    public String getJdbcDriver() {
        return jdbcDriver;
    }

    public String getJdbcConnectionString() {
        return jdbcConnectionString;
    }

    @JsonIgnore
    public String getResolvedMondrianSchemaURL() {
        return resolvedMondrianSchemaURL;
    }

    @JsonProperty(value = "MondrianSchemaUrl")
    public String getMondrianSchemaUrl() {
        return getResolvedMondrianSchemaURL();
    }

    @JsonProperty(value = "MondrianSchemaUrl")
    @JsonIgnore
    void setMondrianSchemaUrl(String value) {
        resolvedMondrianSchemaURL = value;
    }

    public String getDescription() {
        return description;
    }

    @JsonIgnore
    public String getJdbcUser() {
        return jdbcUser;
    }

    @JsonProperty(value = "JdbcUser")
    void setJdbcUser(String value) {
        jdbcUser = value;
    }

    @JsonIgnore
    public String getJdbcPassword() {
        return jdbcPassword;
    }

    @JsonProperty(value = "JdbcPassword")
    void setJdbcPassword(String value) {
        jdbcPassword = value;
    }

    @JsonProperty(value = "catalogContent")
    public void setCatalogContent(String value) {
        catalogContent = value;
    }

    public String getCatalogContent() {
        return catalogContent;
    }

    @JsonProperty(value = "MondrianSchemaContent")
    public String getMondrianSchemaContent() {
        return catalogContent;
    }

    @JsonProperty
    public String getCatalog() {
        return catalog;
    }
    public void setCatalog(String value) {
        this.catalog = value;
    }

    @JsonIgnore
    public Document getMondrianSchemaContentDocument() throws SAXException, IOException, ParserConfigurationException {
        return DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(new InputSource(new StringReader(catalogContent)));
    }

    // @JsonProperty(value = "Catalog")
    // void setCatalog(String path) {
    //     if (path != null) {
    //         catalogUrl = XmlaConnection.class.getResource(path);
    //         if (catalogUrl == null) {
    //             try {
    //                 catalogUrl = new URL(path);
    //             } catch (MalformedURLException e) {
    //             }
    //         }
    //         if (catalogUrl != null) {
    //             resolvedMondrianSchemaURL = catalogUrl.toExternalForm();
    //             try {
    //                 InputStream stream = catalogUrl.openStream();
    //                 catalogContent = IOUtils.toString(stream, Charset.defaultCharset());
    //             } catch (IOException e) {
    //             }
    //         }
    //     }
    //     catalog = path;
    // }

    /**
     * Get the olap4j connection for the parameters represented by this
     * MondrianConnection
     * 
     * @return the connection object
     * @throws SQLException if something goes wrong with the underlying connection
     *                      to the relational database
     */
    @JsonIgnore
    public java.sql.Connection getOlap4jConnection() throws SQLException {

        try {
            Class.forName("mondrian.olap4j.MondrianOlap4jDriver");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException(e);
        }

        Properties props = new Properties();
        setPropertyValue(props, "Jdbc", jdbcConnectionString);
        setPropertyValue(props, "JdbcDrivers", jdbcDriver);
        setPropertyValue(props, "Catalog", catalog);
        setPropertyValue(props, "CatalogContent", catalogContent);
        setPropertyValue(props, "JdbcUser", jdbcUser);
        setPropertyValue(props, "JdbcPassword", jdbcPassword);

        return DriverManager.getConnection("jdbc:mondrian:", props);

    }

    public boolean validate() {
        boolean ret = true;
        if (jdbcConnectionString == null) {
            ret = false;
        }
        if (jdbcDriver == null) {
            ret = false;
        }
        if (catalog == null) {
            ret = false;
        }
        if (catalogContent == null) {
            ret = false;
        }
        return ret;
    }

    private static final Properties setPropertyValue(Properties props, String name, String value) {
        if (value != null) {
            props.setProperty(name, value);
        }
        return props;
    }
}
