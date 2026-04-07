package com.xpert.olap;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.repository.configuration.EnableRedisRepositories;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;
import org.springframework.data.redis.core.RedisTemplate;

@Configuration
@EnableRedisRepositories
public class AppConfig {

    @Value("${redis.host:localhost}")
	private String redisHost;
    @Value("${redis.port:#{6379}}")
	private String redisPort;
    @Value("${redis.password:#{}}")
	private String redisPassword;


    @Bean
    public RedisCacheConfiguration cacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(60))
            .disableCachingNullValues()
            .serializeValuesWith(SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()));
    }

    @Bean
    public LettuceConnectionFactory redisConnectionFactory() {
        // return new LettuceConnectionFactory();
        RedisStandaloneConfiguration redis = new RedisStandaloneConfiguration(this.redisHost); // 使用默认端口
        redis.setPassword(redisPassword);
        return new LettuceConnectionFactory(redis);
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate() {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(redisConnectionFactory());
        return template;
    }
}
