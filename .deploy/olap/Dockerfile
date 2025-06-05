ARG OLAP_VERSION
ARG REDIS_HOST
ARG REDIS_PORT
ARG REDIS_PASSWORD
ARG REDIS_DATABASE

# ==================================================== Stage ==========================================================#
FROM maven:3.8-openjdk-11 AS build

WORKDIR /app

COPY .deploy/olap/settings.xml /usr/share/maven/ref/
COPY packages/olap/pom.xml ./pom.xml
COPY packages/olap/artifactory/ ./artifactory/
RUN mvn install:install-file -Dfile=./artifactory/mondrian-9.4.0.0-343/mondrian-9.4.0.0-343.jar -DgroupId=pentaho -DartifactId=mondrian -Dversion=9.4.0.0-343 -Dpackaging=jar
RUN mvn -B -s /usr/share/maven/ref/settings.xml dependency:resolve

COPY packages/olap/src ./src
RUN mvn -B -s /usr/share/maven/ref/settings.xml clean install

# ==================================================== Stage ==========================================================#
FROM adoptopenjdk:11-jre-hotspot AS webapp

WORKDIR /app

COPY --from=build /app/target/olap-1.1.0.jar /app/app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
