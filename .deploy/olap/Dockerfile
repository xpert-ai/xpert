ARG OLAP_VERSION
ARG REDIS_HOST
ARG REDIS_PORT
ARG REDIS_PASSWORD
ARG REDIS_DATABASE

# ==================================================== Stage ==========================================================#
FROM maven:3.8-openjdk-11 AS build

WORKDIR /app

COPY packages/olap/artifactory/ ./artifactory/
RUN mvn install:install-file \
    -Dfile=./artifactory/pentaho-parent-pom-9.4.0.0-343.pom \
    -DgroupId=org.pentaho \
    -DartifactId=pentaho-parent-pom \
    -Dversion=9.4.0.0-343 \
    -Dpackaging=pom \
  && mvn install:install-file \
      -Dfile=./artifactory/pentaho-ce-parent-pom-9.4.0.0-343.pom \
      -DgroupId=org.pentaho \
      -DartifactId=pentaho-ce-parent-pom \
      -Dversion=9.4.0.0-343 \
      -Dpackaging=pom \
  && mvn install:install-file \
      -Dfile=./artifactory/pentaho-ce-jar-parent-pom-9.4.0.0-343.pom \
      -DgroupId=org.pentaho \
      -DartifactId=pentaho-ce-jar-parent-pom \
      -Dversion=9.4.0.0-343 \
      -Dpackaging=pom \
  && mvn install:install-file \
      -Dfile=./artifactory/pentaho-mondrian-parent-pom-9.4.0.0-343.pom \
      -DgroupId=pentaho \
      -DartifactId=pentaho-mondrian-parent-pom \
      -Dversion=9.4.0.0-343 \
      -Dpackaging=pom \
  && mvn install:install-file \
      -Dfile=./artifactory/mondrian-9.4.0.0-343/mondrian-9.4.0.0-343.jar \
      -DpomFile=./artifactory/mondrian-9.4.0.0-343/mondrian-9.4.0.0-343.pom \
      -DgroupId=pentaho \
      -DartifactId=mondrian \
      -Dversion=9.4.0.0-343 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/eigenbase/eigenbase-resgen/1.3.1/eigenbase-resgen-1.3.1.jar \
      -DpomFile=./artifactory/eigenbase/eigenbase-resgen/1.3.1/eigenbase-resgen-1.3.1.pom \
      -DgroupId=eigenbase \
      -DartifactId=eigenbase-resgen \
      -Dversion=1.3.1 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/eigenbase/eigenbase-xom/1.3.1/eigenbase-xom-1.3.1.jar \
      -DpomFile=./artifactory/eigenbase/eigenbase-xom/1.3.1/eigenbase-xom-1.3.1.pom \
      -DgroupId=eigenbase \
      -DartifactId=eigenbase-xom \
      -Dversion=1.3.1 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/eigenbase/eigenbase-xom/1.3.5/eigenbase-xom-1.3.5.jar \
      -DpomFile=./artifactory/eigenbase/eigenbase-xom/1.3.5/eigenbase-xom-1.3.5.pom \
      -DgroupId=eigenbase \
      -DartifactId=eigenbase-xom \
      -Dversion=1.3.5 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/eigenbase/eigenbase-properties/1.1.2/eigenbase-properties-1.1.2.jar \
      -DpomFile=./artifactory/eigenbase/eigenbase-properties/1.1.2/eigenbase-properties-1.1.2.pom \
      -DgroupId=eigenbase \
      -DartifactId=eigenbase-properties \
      -Dversion=1.1.2 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/olap4j/olap4j-xmla/1.2.0/olap4j-xmla-1.2.0.jar \
      -DpomFile=./artifactory/olap4j/olap4j-xmla/1.2.0/olap4j-xmla-1.2.0.pom \
      -DgroupId=org.olap4j \
      -DartifactId=olap4j-xmla \
      -Dversion=1.2.0 \
      -Dpackaging=jar \
  && mvn install:install-file \
      -Dfile=./artifactory/javacup/javacup-10k.jar \
      -DpomFile=./artifactory/javacup/javacup-10k.pom \
      -DgroupId=javacup \
      -DartifactId=javacup \
      -Dversion=10k \
      -Dpackaging=jar

COPY packages/olap/pom.xml ./pom.xml
RUN mvn dependency:resolve

COPY packages/olap/src ./src
RUN mvn clean install

# ==================================================== Stage ==========================================================#
FROM eclipse-temurin:11-jre AS webapp

WORKDIR /app

COPY --from=build /app/target/olap-1.1.0.jar /app/app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]