package com.pangolin.olap.web;

import java.util.Map;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import javax.servlet.ServletConfig;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.w3c.dom.Element;

import mondrian.xmla.XmlaConstants;
import mondrian.xmla.XmlaRequestCallback;

public class AuthXmlaRequestCallback implements XmlaRequestCallback {
    private final Log LOGGER = LogFactory.getLog(AuthXmlaRequestCallback.class);

    public boolean processHttpHeader(
        HttpServletRequest request,
        HttpServletResponse response,
        Map<String, Object> context)
        throws Exception
    {
        String encodedRoleName = request.getHeader("mondrian-role");
        if (encodedRoleName != null) {
            String decodedRoleName = URLDecoder.decode(encodedRoleName, StandardCharsets.UTF_8);
            LOGGER.debug("Decoded mondrian-role: " + encodedRoleName);
            context.put(XmlaConstants.CONTEXT_ROLE_NAME, decodedRoleName);
        }
        // We do not perform any special header treatment.
        return true;
    }

    @Override
    public void init(ServletConfig servletConfig) throws ServletException {
        // TODO Auto-generated method stub
        
    }

    @Override
    public void preAction(HttpServletRequest request, Element[] requestSoapParts, Map<String, Object> context)
            throws Exception {
        // TODO Auto-generated method stub
        
    }

    @Override
    public String generateSessionId(Map<String, Object> context) {
        // TODO Auto-generated method stub
        return null;
    }

    @Override
    public void postAction(HttpServletRequest request, HttpServletResponse response, byte[][] responseSoapParts,
            Map<String, Object> context) throws Exception {
        // TODO Auto-generated method stub
        
    }
    
}
