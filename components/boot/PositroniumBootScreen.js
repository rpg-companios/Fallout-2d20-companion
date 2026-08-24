import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const BG = '#050508';
const ART = require('../../modules/fallout/splash/annihilation.png');
const BAR_FILL = require('../../assets/boot/bar-fill.png');
const ART_RATIO = 704 / 1520;
const BAR_TOP = 0.6947;
const BAR_W_RATIO = 220 / 704;

const FADE_IN_MS = 1600;
const BAR_DELAY_MS = 1100;
const MIN_VISIBLE_MS = 2400;

export default function PositroniumBootScreen({
  ready = false,
  progress = 0,
  onFinished,
}) {
  const { width, height } = useWindowDimensions();
  const artH = Math.min(height, width / ART_RATIO);
  const artW = artH * ART_RATIO;
  const barW = artW * BAR_W_RATIO;
  const barH = Math.max(2, Math.round(artW * (3 / 704)));

  const screenOpacity = useRef(new Animated.Value(1)).current;
  const artOpacity = useRef(new Animated.Value(0)).current;
  const artScale = useRef(new Animated.Value(1.07)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;

  const closing = useRef(false);
  const readyRef = useRef(ready);
  const onFinishedRef = useRef(onFinished);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const driveFill = (to, duration) => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, to)),
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(artOpacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(artScale, {
        toValue: 1,
        duration: FADE_IN_MS + 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(barOpacity, {
      toValue: 1,
      duration: 700,
      delay: BAR_DELAY_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const startBar = setTimeout(() => driveFill(0.12, 600), BAR_DELAY_MS);
    const creep = setTimeout(() => {
      if (readyRef.current) return;
      Animated.timing(fill, {
        toValue: 0.84,
        duration: 7000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, BAR_DELAY_MS + 700);

    return () => {
      clearTimeout(startBar);
      clearTimeout(creep);
    };
  }, []);

  useEffect(() => {
    if (ready) return;
    if (progress > 0) driveFill(Math.min(0.9, Math.max(progress, 0.12)), 560);
  }, [progress, ready]);

  useEffect(() => {
    if (!ready || closing.current) return;
    closing.current = true;
    driveFill(1, 320);
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const t = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinishedRef.current?.();
      });
    }, wait + 280);
    return () => clearTimeout(t);
  }, [ready]);

  const fillShift = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [-barW, 0],
  });

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <StatusBar style="light" backgroundColor={BG} />
      <View style={{ width: artW, height: artH }}>
        <Animated.Image
          source={ART}
          resizeMode="contain"
          style={{
            width: artW,
            height: artH,
            opacity: artOpacity,
            transform: [{ scale: artScale }],
          }}
        />
        <Animated.View
          style={[
            styles.barDock,
            { top: artH * BAR_TOP, opacity: barOpacity },
          ]}
        >
          <View style={[styles.track, { width: barW, height: barH, borderRadius: barH }]}>
            <Animated.Image
              source={BAR_FILL}
              resizeMode="cover"
              style={{
                width: barW,
                height: barH,
                transform: [{ translateX: fillShift }],
              }}
            />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { height: '100vh', width: '100%' },
      default: {},
    }),
  },
  barDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  track: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
});
