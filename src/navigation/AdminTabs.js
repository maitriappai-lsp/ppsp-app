import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import MastersScreen from '../screens/admin/MastersScreen';
import OverrideScreen from '../screens/admin/OverrideScreen';
import ContentAdminScreen from '../screens/admin/ContentAdminScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import SearchScreen from '../screens/admin/SearchScreen';
import LeaveAdminScreen from '../screens/admin/LeaveAdminScreen';
import { useData } from '../data/store';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Masters: 'people-outline',
  Override: 'hammer-outline',
  Leave: 'calendar-outline',
  Content: 'document-text-outline',
  Dashboard: 'stats-chart-outline',
  Search: 'search-outline',
};

// Bottom nav order: Masters · Override · Leave · Content · Dashboard · Search
// (Leave shows a count of requests waiting for a decision.)
// (Admin also has everything a Facilitator has -- see App.js's RootNavigator
// for the "Switch to facilitator view" entry point into FacilitatorTabs.)
export default function AdminTabs() {
  const { db } = useData();
  const pendingLeave = db.leaveRequests.filter((r) => r.status === 'Pending').length;
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
      <Tab.Screen name="Masters" component={MastersScreen} />
      <Tab.Screen name="Override" component={OverrideScreen} />
      <Tab.Screen name="Leave" component={LeaveAdminScreen} options={{ tabBarBadge: pendingLeave > 0 ? pendingLeave : undefined }} />
      <Tab.Screen name="Content" component={ContentAdminScreen} />
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}
