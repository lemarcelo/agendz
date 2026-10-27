# Imagem da API (usada pelo deploy na F1). Build: docker build -t agendz-api backend/
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -ntp -q dependency:go-offline
COPY src ./src
RUN mvn -B -ntp -q -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 agendz
USER agendz
WORKDIR /app
COPY --from=build /app/target/agendz-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
