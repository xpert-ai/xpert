package com.xpert.olap;

import com.xpert.olap.web.XmlaServlet;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;


@SpringBootApplication
// @EnableCaching
public class OlapApplication {

	private final Log log = LogFactory.getLog(OlapApplication.class);

	@Autowired
	private XmlaServlet xmlaServlet;
	
	public static void main(String[] args) {
		SpringApplication.run(OlapApplication.class, args);
	}

	@Bean
	public ServletRegistrationBean<XmlaServlet> xmla() {
		ServletRegistrationBean<XmlaServlet> servlet = new ServletRegistrationBean<XmlaServlet>(xmlaServlet, "/xmla");
		servlet.addInitParameter(XmlaServlet.PARAM_CHAR_ENCODING, "UTF-8");
		servlet.addInitParameter(XmlaServlet.PARAM_CALLBACKS, "com.xpert.olap.web.AuthXmlaRequestCallback");
		return servlet;
	}

	// 可能只对 Spring MVC rest 起作用， 对 Servlet 不起作用
	// @Bean
	// public WebMvcConfigurer corsConfigurer() {
	// 	return new WebMvcConfigurer() {
	// 		@Override
	// 		public void addCorsMappings(CorsRegistry registry) {
	// 			registry.addMapping("/xmla").allowedOrigins("http://localhost:9876");
	// 		}
	// 	};
	// }
}
