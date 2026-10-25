import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import AttendanceScreen from '../screens/facilitator/AttendanceScreen';
import UploadsScreen from '../screens/facilitator/UploadsScreen';
import DashboardScreen from '../screens/facilitator/DashboardScreen';
import ContentScreen from '../screens/facilitator/ContentScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Attendance: 'location-outline',
  Uploads: 'cloud-upload-outline',
  Dashboard: 'stats-chart-outline',
  Content: 'book-outline',
};

// Bottom nav order: Attendance · Uploads · Dashboard · Content (PPSP has no Sessions)
export default function FacilitatorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        // Without a tabBarIcon, React Navigation draws a placeholder box.
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Uploads" component={UploadsScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Content" component={ContentScreen} />
    </Tab.Navigator>
  );
}
