import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../src/theme/tokens';

interface AppEntranceProps {
  children: React.ReactNode;
}

/** A once-per-launch brand reveal that never blocks route interaction. */
export function AppEntrance({ children }: AppEntranceProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const markY = useRef(new Animated.Value(8)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(.88)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(markY, { toValue: 0, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ringScale, { toValue: 1, duration: 680, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(460),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(markOpacity, { toValue: 0, duration: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();
  }, [markOpacity, markY, opacity, ringOpacity, ringScale]);

  return <View style={styles.root}>
    {children}
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]} accessibilityElementsHidden>
      <Animated.View style={[styles.ring, styles.outerRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={[styles.ring, styles.innerRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={{ opacity: markOpacity, transform: [{ translateY: markY }] }}>
        <Text style={styles.wordmark}>HALF·LIFE</Text>
        <Text style={styles.tagline}>TONIGHT, IN CONTEXT</Text>
      </Animated.View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: 999 },
  outerRing: { width: 144, height: 144, borderColor: alpha(color.primary, .34) },
  innerRing: { width: 108, height: 108, borderColor: alpha(color.routeTarget, .32) },
  wordmark: { color: color.text, fontFamily: font.mono, fontSize: 20, fontWeight: '500', letterSpacing: 5, textAlign: 'center' },
  tagline: { color: color.primary, fontFamily: font.mono, fontSize: 10, letterSpacing: 1.5, marginTop: 12, textAlign: 'center' },
});
