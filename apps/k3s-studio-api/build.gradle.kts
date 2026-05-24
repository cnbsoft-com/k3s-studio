var target = (project.findProperty("target") as? String) ?: "local"

plugins {
  java
  id("org.springframework.boot") version "3.4.4"
  id("io.spring.dependency-management") version "1.1.7"
}

group = "com.cnbsoft.k3s-studio"
version = "0.1.0"

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
}

repositories {
  mavenCentral()
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.boot:spring-boot-starter-validation")
  implementation("com.fasterxml.jackson.module:jackson-module-parameter-names")
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("com.hierynomus:sshj:0.38.0")
  implementation("io.fabric8:kubernetes-client:7.0.0")

  runtimeOnly("org.postgresql:postgresql")

  compileOnly("org.projectlombok:lombok")
  annotationProcessor("org.projectlombok:lombok")

  implementation("org.springframework.boot:spring-boot-starter-test")
  implementation("org.bgee.log4jdbc-log4j2:log4jdbc-log4j2-jdbc4.1:1.16")
  }
sourceSets {
  main {
    resources {
      srcDirs("src/main/resources", "src/main/resources-${target}")
    }
  }
}

tasks.withType<Test> {
  useJUnitPlatform()
}

tasks.named<ProcessResources>("processResources") {
  duplicatesStrategy = DuplicatesStrategy.INCLUDE
}