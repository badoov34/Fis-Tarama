/**
 * ZoomableImage — Tam ekran görüntüleyici.
 *
 * Gerçek pinch-to-zoom (iki parmak) + tek parmak kaydırma.
 * Hiçbir ek bağımlılık gerektirmez — sadece Animated + native touch events.
 */
import { useRef, useCallback } from "react";
import {
  View, Modal, TouchableOpacity, Text, StyleSheet,
  Animated, Dimensions, Platform,
} from "react-native";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function ZoomableImage({ uri, visible, onClose }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // Persistent state (Animated.Value doesn't give .getValue reliably)
  const state = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    // pinch tracking
    initialDist: null,
    initialScale: 1,
    // pan tracking
    panStartX: 0,
    panStartY: 0,
    lastTx: 0,
    lastTy: 0,
    moving: false, // is panning
  });

  const resetView = useCallback(() => {
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
    const s = state.current;
    s.scale = 1; s.tx = 0; s.ty = 0;
    s.initialDist = null;
    s.lastTx = 0; s.lastTy = 0;
  }, [scale, tx, ty]);

  const handleClose = useCallback(() => {
    resetView();
    onClose();
  }, [resetView, onClose]);

  // ─── Touch handlers ────────────────────────────────────────────────
  const onTouchStart = useCallback((e) => {
    const touches = e.nativeEvent.touches;
    const s = state.current;

    if (touches.length === 2) {
      // Pinch start
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      s.initialDist = Math.sqrt(dx * dx + dy * dy);
      s.initialScale = s.scale;
      s.moving = false;
    } else if (touches.length === 1) {
      // Pan start (only when zoomed in)
      if (s.scale > 1) {
        s.panStartX = touches[0].pageX;
        s.panStartY = touches[0].pageY;
        s.lastTx = s.tx;
        s.lastTy = s.ty;
        s.moving = true;
      }
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    const touches = e.nativeEvent.touches;
    const s = state.current;

    if (touches.length === 2 && s.initialDist !== null) {
      // ── Pinch ──
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let newScale = s.initialScale * (dist / s.initialDist);
      newScale = Math.min(Math.max(newScale, 0.5), 5);
      s.scale = newScale;
      scale.setValue(newScale);
    } else if (touches.length === 1 && s.moving && s.scale > 1) {
      // ── Pan ──
      const dx = touches[0].pageX - s.panStartX;
      const dy = touches[0].pageY - s.panStartY;
      const newTx = s.lastTx + dx;
      const newTy = s.lastTy + dy;
      s.tx = newTx;
      s.ty = newTy;
      tx.setValue(newTx);
      ty.setValue(newTy);
    }
  }, [scale, tx, ty]);

  const onTouchEnd = useCallback((e) => {
    const touches = e.nativeEvent.touches;
    const s = state.current;

    // Pinch bitiş → minimum scale kontrolü
    if (touches.length < 2) {
      s.initialDist = null;
      if (s.scale < 1) {
        // Küçükse geri dön
        s.scale = 1; s.tx = 0; s.ty = 0;
        s.lastTx = 0; s.lastTy = 0;
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
          Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
          Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
        ]).start();
      }
    }

    // Pan bitiş
    if (touches.length === 0) {
      s.moving = false;
    }
  }, [scale, tx, ty]);

  // ─── Double tap to reset/toggle ────────────────────────────────────
  const lastTap = useRef(0);
  const onDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const s = state.current;
      const newScale = s.scale > 1 ? 1 : 2.5;
      s.scale = newScale;
      s.tx = 0; s.ty = 0;
      s.lastTx = 0; s.lastTy = 0;
      Animated.parallel([
        Animated.spring(scale, { toValue: newScale, useNativeDriver: true }),
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
      ]).start();
    }
    lastTap.current = now;
  }, [scale, tx, ty]);

  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalBg}>
        {/* Close */}
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Hint */}
        <Text style={styles.hint}>İki parmakla yakınlaştır • Çift tıkla: sıfırla</Text>

        {/* Zoomable image */}
        <View
          style={styles.imageContainer}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={onDoubleTap}
            style={styles.imageTouchable}
          >
            <Animated.Image
              source={{ uri }}
              style={[
                styles.modalImage,
                {
                  transform: [
                    { translateX: tx },
                    { translateY: ty },
                    { scale },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  hint: {
    position: "absolute",
    bottom: 40,
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    zIndex: 10,
  },
  imageContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imageTouchable: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: SCREEN_W * 0.95,
    height: SCREEN_H * 0.8,
  },
});
