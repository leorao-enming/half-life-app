import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// iOS gets richer system material blur; Android uses dark tint
const BLUR_TINT = Platform.select({
  ios: 'systemThickMaterialDark' as const,
  default: 'dark' as const,
});

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  name: IoniconName;
  color: string;
  focused: boolean;
}

function TabIcon({ name, color, focused }: TabIconProps) {
  return (
    <View style={[
      styles.iconWrap,
      focused && {
        backgroundColor: 'transparent',
        shadowColor:     color,
        shadowOffset:    { width: 0, height: 0 },
        shadowOpacity:   0.9,
        shadowRadius:    12,
        elevation:       10,
      },
    ]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint={BLUR_TINT}
            style={[StyleSheet.absoluteFill, styles.tabBarBlur]}
          />
        ),
        tabBarInactiveTintColor: '#2E2E2E',
        tabBarLabelStyle: {
          fontFamily:    MONO,
          fontSize:      8,
          letterSpacing: 3,
          marginBottom:  8,
        },
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'REACTOR',
          tabBarActiveTintColor: '#FFFF33',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="pulse-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'ANALYTICS',
          tabBarActiveTintColor: '#0FF0FC',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bar-chart-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="lab"
        options={{
          title: 'LAB',
          tabBarActiveTintColor: '#00FF87',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="flask-outline" color={color} focused={focused} />
          ),
        }}
      />
      {/* Inject is a modal — hidden from tab bar, accessed via FAB */}
      <Tabs.Screen
        name="inject"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position:        'absolute',
    borderTopWidth:  0,
    backgroundColor: 'transparent',
    elevation:       0,
    height:          72,
  },
  tabBarBlur: {
    borderTopWidth:  0.5,
    borderTopColor:  'rgba(255, 255, 255, 0.07)',
  },
  iconWrap: {
    alignItems:       'center',
    justifyContent:   'center',
    paddingTop:       4,
    backgroundColor:  'transparent',
  },
  tabItem: {
    paddingTop: 8,
  },
});
