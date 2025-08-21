# Check if the installation has already been performed
if [ ! -f "./artifacts_installed" ]; then
  echo "Execute the installation command..."

  # Execute the Maven installation command
  mvn install:install-file \
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

  # Create a flag file to indicate that the installation is complete
  touch ./artifacts_installed
fi

# Continue to perform other operations
eval "$(
  cat ../../.env | awk '!/^\s*#/' | awk '!/^\s*$/' | while IFS='' read -r line; do
    key=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)
    echo "export $key=\"$value\""
  done
)"

mvn spring-boot:run
