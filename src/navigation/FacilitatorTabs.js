import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useData } from '../data/store';
import { useAuth } from '../context/AuthContext';
import { isAuditFacilitator } from '../utils/roles';
import { syncOutbox } from '../data/dsrOutbox';
import AttendanceScreen from '../screens/facilitator/AttendanceScreen';
import DsrScreen from '../screens/facilitator/DsrScreen';
import UpdateScreen from '../screens/facilitator/UpdateScreen';
import UploadsScreen from '../screens/facilitator/UploadsScreen';
import DashboardScreen from '../screens/facilitator/DashboardScreen';
import ContentScreen from '../screens/facilitator/ContentScreen';
import AuditScreen from '../screens/facilitator/AuditScreen';

const Tab = createBottomTabNavigator();

// Uploads any DSRs that were saved on the phone while offline. Runs whenever the
// facilitator is signed in (not just on the DSR screen): on start, every 20
// seconds while the app is open, and whenever the app comes back to the
// foreground. With nothing waiting it does nothing and makes no request.
function DsrUploader() {
  const { refresh } = useData();
  useEffect(() => {
    const run = () => {
      if (AppState.currentState === 'active') syncOutbox(refresh).catch(() => {});
    };
    run();
    const timer = setInterval(run, 20000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return null;
}

const TAB_ICONS = {
  Attendance: 'location-outline',
  DSR: 'document-text-outline',
  Update: 'create-outline',
  Audit: 'clipboard-outline',
  Uploads: 'cloud-upload-outline',
  Dashboard: 'stats-chart-outline',
  Content: 'book-outline',
};

// Bottom nav order: Attendance · DSR · Update · Uploads · Dashboard · Content
export default function FacilitatorTabs() {
  const { currentUser } = useAuth();
  // Only an Audit Facilitator gets the Audit tab (on top of everything a Facilitator has).
  const auditor = isAuditFacilitator(currentUser?.role);
  return (
    <>
    <DsrUploader />
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        // seven tabs for an audit facilitator: smaller labels so they all fit
        tabBarLabelStyle: auditor ? { fontSize: 10 } : undefined,
        // Without a tabBarIcon, React Navigation draws a placeholder box.
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="DSR" component={DsrScreen} />
      <Tab.Screen name="Update" component={UpdateScreen} />
      <Tab.Screen name="Uploads" component={UploadsScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Content" component={ContentScreen} />
      {auditor && <Tab.Screen name="Audit" component={AuditScreen} />}
    </Tab.Navigator>
    </>
  );
}
