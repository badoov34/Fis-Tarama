/**
 * Fiş Tarama — Ana Uygulama.
 *
 * React Native + Expo ile çalışan mobil gider takip uygulaması.
 * OCR ile fiş okuma, KDV dökümü, Excel/PDF rapor üretimi.
 */
import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import { Text } from "react-native";

// Ekranlar
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ScanScreen from "./src/screens/ScanScreen";
import ManualAddScreen from "./src/screens/ManualAddScreen";
import ExpensesScreen from "./src/screens/ExpensesScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ExpenseDetailScreen from "./src/screens/ExpenseDetailScreen";
import ExpenseEditScreen from "./src/screens/ExpenseEditScreen";
import TrashScreen from "./src/screens/TrashScreen";
import ProfileScreen from "./src/screens/ProfileScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Tab simge/metin renkleri
const activeColor = "#0284C7";
const inactiveColor = "#94A3B8";

function TabIcon({ label, focused }) {
  const icons = {
    "Ana Sayfa": "🏠",
    "Dashboard": "📊",
    "Giderler": "📋",
    "Tara": "📷",
    "Rapor": "📈",
    "Çöp": "🗑️",
    "Profil": "👤",
  };
  return (
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] || "📄"}
    </Text>
  );
}

// Bottom Tab Navigator
function MainTabs({ onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#E2E8F0",
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Ana Sayfa" component={HomeScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Giderler" component={ExpensesScreen} />
      <Tab.Screen
        name="Tara"
        component={ScanScreen}
        options={{ tabBarLabel: "Fiş Çek" }}
      />
      <Tab.Screen name="Rapor" component={ReportsScreen} />
      <Tab.Screen name="Çöp" component={TrashScreen} options={{ tabBarLabel: "Çöp Kutusu" }} />
      <Tab.Screen name="Profil" options={{ tabBarLabel: "Profil" }}>
        {() => <ProfileScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// Ana Stack Navigator (giriş yapıldığında)
function AppStack({ onLogout }) {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        options={{ headerShown: false }}
      >
        {() => <MainTabs onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen
        name="ManualAdd"
        component={ManualAddScreen}
        options={{ title: "Manuel Ekle", headerTintColor: activeColor }}
      />
      <Stack.Screen
        name="ExpenseDetail"
        component={ExpenseDetailScreen}
        options={{ title: "Gider Detayı", headerTintColor: activeColor }}
      />
      <Stack.Screen
        name="ExpenseEdit"
        component={ExpenseEditScreen}
        options={{ title: "Gideri Düzenle", headerTintColor: activeColor }}
      />
      <Stack.Screen
        name="Trash"
        component={TrashScreen}
        options={{ title: "Çöp Kutusu", headerTintColor: activeColor }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Oturum kontrolü
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync("auth_token");
        if (token) {
          const userData = await SecureStore.getItemAsync("user");
          if (userData) {
            setUser(JSON.parse(userData));
          }
        }
      } catch (e) {
        console.log("Oturum kontrolü hatası:", e);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("auth_token");
    await SecureStore.deleteItemAsync("user");
    setUser(null);
  };

  if (loading) {
    return (
      <Text style={{ flex: 1, textAlign: "center", marginTop: 200, fontSize: 18, color: "#0284C7" }}>
        Yükleniyor...
      </Text>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      {user ? (
        <AppStack onLogout={handleLogout} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login">
            {() => <LoginScreen onLogin={handleLogin} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
