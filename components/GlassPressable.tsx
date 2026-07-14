import React from 'react';
import { Pressable, type PressableProps, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { alpha, color } from '../src/theme/tokens';

interface GlassPressableProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}

export function GlassPressable({ children, style, selected = false, ...props }: GlassPressableProps) {
  return <Pressable {...props} style={({ pressed }) => [styles.button, selected && styles.selected, style, pressed && styles.pressed]}>
    <BlurView pointerEvents="none" intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
    {children}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { overflow: 'hidden', borderWidth: 1, borderColor: alpha(color.text, .18), backgroundColor: alpha(color.surfaceHi, .42) },
  selected: { borderColor: alpha(color.primary, .74), backgroundColor: alpha(color.primary, .1) },
  pressed: { opacity: .72 },
});
