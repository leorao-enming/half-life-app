import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import { alpha, color } from '../src/theme/tokens';

interface AuroraCurtainProps {
  width: number;
  height: number;
  curvePath: string;
  curtainPath: string;
}

const TEXTURE_BANDS = [
  { x: .055, width: .05, bend: -.015, opacity: .08 },
  { x: .14, width: .075, bend: .025, opacity: .11 },
  { x: .255, width: .045, bend: -.02, opacity: .07 },
  { x: .36, width: .09, bend: .018, opacity: .12 },
  { x: .49, width: .052, bend: -.022, opacity: .09 },
  { x: .59, width: .08, bend: .024, opacity: .11 },
  { x: .7, width: .044, bend: -.015, opacity: .08 },
  { x: .79, width: .085, bend: .02, opacity: .12 },
  { x: .91, width: .046, bend: -.018, opacity: .07 },
] as const;

/**
 * A curve-defined aurora: the route is the mask's upper boundary, so every
 * part of the curtain begins at the line and fades only downward from there.
 */
export function AuroraCurtain({ width, height, curvePath, curtainPath }: AuroraCurtainProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const breath = useRef(new Animated.Value(.7)).current;
  const drift = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      breath.setValue(.7);
      drift.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(breath, { toValue: .9, duration: 7_200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: .7, duration: 7_200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(drift, { toValue: 2, duration: 6_400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: -1, duration: 6_400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ]));
    animation.start();
    return () => animation.stop();
  }, [breath, drift, reduceMotion]);

  const maskId = 'night-aurora-mask';
  const textureMaskId = 'night-aurora-texture-mask';
  return <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: breath }]}>
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="aurora-horizontal" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color.energy} stopOpacity={.72} />
          <Stop offset=".36" stopColor="#CFD4D0" stopOpacity={.52} />
          <Stop offset=".58" stopColor="#9AC6C1" stopOpacity={.5} />
          <Stop offset="1" stopColor={color.primary} stopOpacity={.76} />
        </LinearGradient>
        <LinearGradient id="aurora-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={.56} />
          <Stop offset=".22" stopColor="#FFFFFF" stopOpacity={.28} />
          <Stop offset=".62" stopColor="#FFFFFF" stopOpacity={.08} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <Mask id={maskId} x="0" y="0" width={width} height={height}>
          <Path d={curtainPath} fill={`url(#aurora-fade)`} />
        </Mask>
      </Defs>

      {/* The body is masked by the exact route-defined silhouette, not a rectangle. */}
      <G mask={`url(#${maskId})`}>
        <Rect x={0} y={0} width={width} height={height} fill="url(#aurora-horizontal)" />
      </G>

      {/* Soft near-line bloom, then the precise hanging rail above it. */}
      <Path d={curvePath} stroke="url(#aurora-horizontal)" strokeWidth={8} strokeOpacity={.1} fill="none" strokeLinecap="round" />
      <Path d={curvePath} stroke="url(#aurora-horizontal)" strokeWidth={3.4} strokeOpacity={.25} fill="none" strokeLinecap="round" />
      <Path d={curvePath} stroke="url(#aurora-horizontal)" strokeWidth={1.45} fill="none" strokeLinecap="round" />
    </Svg>
    <Animated.View pointerEvents="none" style={[styles.textureOverlay, { transform: [{ translateX: drift }, { translateY: drift }] }]}>
      <Svg width={width + 4} height={height}>
        <Defs>
          <LinearGradient id="aurora-moving-texture" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E9F4EC" stopOpacity={.74} /><Stop offset=".36" stopColor="#D5F1EC" stopOpacity={.23} /><Stop offset="1" stopColor="#D5F1EC" stopOpacity={0} /></LinearGradient>
          <LinearGradient id="aurora-moving-fade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FFFFFF" stopOpacity={.65} /><Stop offset=".3" stopColor="#FFFFFF" stopOpacity={.22} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></LinearGradient>
          <Mask id={textureMaskId} x="0" y="0" width={width + 4} height={height}><Path d={curtainPath} fill="url(#aurora-moving-fade)" /></Mask>
        </Defs>
        <G mask={`url(#${textureMaskId})`}>
          {TEXTURE_BANDS.map((band) => {
            const x = band.x * width;
            const bandWidth = band.width * width;
            const bend = band.bend * width;
            return <Path key={band.x} d={`M${x} 0 C${x + bend} ${height * .25} ${x - bend} ${height * .58} ${x + bend} ${height} L${x + bandWidth + bend} ${height} C${x + bandWidth - bend} ${height * .58} ${x + bandWidth + bend} ${height * .25} ${x + bandWidth} 0 Z`} fill="url(#aurora-moving-texture)" opacity={band.opacity} />;
          })}
        </G>
      </Svg>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  textureOverlay: { ...StyleSheet.absoluteFillObject },
});
