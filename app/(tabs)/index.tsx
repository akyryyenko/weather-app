import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
const CITIES = ['Kyiv', 'Warsaw', 'London'];

type WeatherData = {
  city: string;
  temp: number;
  description: string;
  icon: string;
  feels_like: number;
  humidity: number;
};

export default function HomeScreen() {
  const [weatherList, setWeatherList] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllCities();
  }, []);

  async function fetchAllCities() {
    try {
      const results = await Promise.all(
        CITIES.map(async (city) => {
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=uk`
          );
          const data = await res.json();
          return {
            city: data.name,
            temp: Math.round(data.main.temp),
            description: data.weather[0].description,
            icon: data.weather[0].icon,
            feels_like: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
          };
        })
      );
      setWeatherList(results);
    } catch (e) {
      setError('Помилка завантаження погоди');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={styles.loadingText}>Завантаження погоди...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Погода</Text>
      {weatherList.map((weather) => (
        <View key={weather.city} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cityName}>{weather.city}</Text>
            <Image
              source={{ uri: `https://openweathermap.org/img/wn/${weather.icon}@2x.png` }}
              style={styles.icon}
            />
          </View>
          <Text style={styles.temp}>{weather.temp}°C</Text>
          <Text style={styles.description}>{weather.description}</Text>
          <View style={styles.details}>
            <Text style={styles.detailText}>Відчувається: {weather.feels_like}°C</Text>
            <Text style={styles.detailText}>Вологість: {weather.humidity}%</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cityName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  icon: {
    width: 60,
    height: 60,
  },
  temp: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4A90D9',
    marginTop: 4,
  },
  description: {
    fontSize: 16,
    color: '#a0a0b0',
    textTransform: 'capitalize',
    marginTop: 4,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  detailText: {
    color: '#a0a0b0',
    fontSize: 14,
  },
});
