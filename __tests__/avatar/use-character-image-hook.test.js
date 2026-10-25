// __tests__/avatar/use-character-image-hook.test.js
//
// Интеграционные тесты для хука useCharacterImage
// Проверяем взаимодействие между функциями хука и изменение состояния

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Мокаем expo-image-picker
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: {
    Images: 'images',
  },
}));

// Мокаем avatarCache
vi.mock('../../db/avatarCache', () => ({
  setAvatarCache: vi.fn(() => Promise.resolve()),
  getAvatarCache: vi.fn(() => Promise.resolve(null)),
}));

// Мокаем alertService
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(() => Promise.resolve()),
}));

// Мокаем characterAvatar
vi.mock('../../domain/characterAvatar', () => ({
  AVATAR_LIMITS: {
    maxBytes: 5 * 1024 * 1024,
  },
  validateAvatarDataUrl: vi.fn((dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return { ok: false, reason: 'avatar.invalidFormat', bytes: 0 };
    }
    if (dataUrl.startsWith('data:image/')) {
      return { ok: true, reason: null, bytes: 1024, mimeType: dataUrl.split(';')[0].replace('data:', '') };
    }
    return { ok: false, reason: 'avatar.invalidFormat', bytes: 0 };
  }),
  base64ByteLength: vi.fn(() => 1024),
}));

import { useCharacterImage } from '../../domain/useCharacterImage';
import * as ImagePicker from 'expo-image-picker';
import * as avatarCache from '../../db/avatarCache';
import { showRawAlert } from '../../components/alerts/alertService';

describe('useCharacterImage hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('imageVersion state', () => {
    it('initial imageVersion is 0', () => {
      const { result } = renderHook(() => useCharacterImage());
      expect(result.current.imageVersion).toBe(0);
    });

    it('imageVersion increases after successful image save', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,SGVsbG8=',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

      const { result } = renderHook(() => useCharacterImage());
      const initialVersion = result.current.imageVersion;

      // Act
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(result.current.imageVersion).toBe(initialVersion + 1);
      expect(avatarCache.setAvatarCache).toHaveBeenCalled();
    });

    it('imageVersion does NOT increase when user cancels selection', async () => {
      // Arrange
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      });

      const { result } = renderHook(() => useCharacterImage());
      const initialVersion = result.current.imageVersion;

      // Act
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(result.current.imageVersion).toBe(initialVersion);
      expect(avatarCache.setAvatarCache).not.toHaveBeenCalled();
    });

    it('imageVersion does NOT increase when permission is denied', async () => {
      // Arrange
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const { result } = renderHook(() => useCharacterImage());
      const initialVersion = result.current.imageVersion;

      // Act
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(result.current.imageVersion).toBe(initialVersion);
      expect(avatarCache.setAvatarCache).not.toHaveBeenCalled();
    });

    it('imageVersion does NOT increase when image is too large', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 6 * 1024 * 1024, // 6MB > 5MB limit
        base64: 'data:image/jpeg;base64,SGVsbG8=',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

      const { result } = renderHook(() => useCharacterImage());
      const initialVersion = result.current.imageVersion;

      // Act
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(result.current.imageVersion).toBe(initialVersion);
      expect(showRawAlert).toHaveBeenCalled();
      expect(avatarCache.setAvatarCache).not.toHaveBeenCalled();
    });

    it('imageVersion increases on each successful save', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,SGVsbG8=',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

      const { result } = renderHook(() => useCharacterImage());

      // Act - first save
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });
      expect(result.current.imageVersion).toBe(1);

      // Act - second save
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });
      expect(result.current.imageVersion).toBe(2);

      // Act - third save
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });
      expect(result.current.imageVersion).toBe(3);
    });
  });

  describe('isLoading state', () => {
    it('isLoading is false initially', () => {
      const { result } = renderHook(() => useCharacterImage());
      expect(result.current.isLoading).toBe(false);
    });

    it('isLoading becomes true during image processing', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,SGVsbG8=',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

      const { result } = renderHook(() => useCharacterImage());

      // Act - start picking
      let resolvePick;
      const pickPromise = act(async () => {
        const promise = result.current.pickAndSaveCharacterImage('test-char-1');
        // Wait a bit to check isLoading
        await new Promise(r => setTimeout(r, 0));
        expect(result.current.isLoading).toBe(true);
        return promise;
      });

      await pickPromise;
      expect(result.current.isLoading).toBe(false);
    });

    it('isLoading becomes false after error', async () => {
      // Arrange
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [],
      });

      const { result } = renderHook(() => useCharacterImage());

      // Act
      await act(async () => {
        await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('getCharacterImageUrl', () => {
    it('returns null when characterId is not provided', async () => {
      const { result } = renderHook(() => useCharacterImage());
      const url = await result.current.getCharacterImageUrl(null);
      expect(url).toBeNull();
    });

    it('returns null when no image in cache', async () => {
      avatarCache.getAvatarCache.mockResolvedValue(null);

      const { result } = renderHook(() => useCharacterImage());
      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBeNull();
    });

    it('returns dataUrl when image exists in cache', async () => {
      const cachedImage = { data_url: 'data:image/jpeg;base64,test' };
      avatarCache.getAvatarCache.mockResolvedValue(cachedImage);

      const { result } = renderHook(() => useCharacterImage());
      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBe('data:image/jpeg;base64,test');
    });

    it('returns dataUrl from dataUrl field', async () => {
      const cachedImage = { dataUrl: 'data:image/png;base64,test' };
      avatarCache.getAvatarCache.mockResolvedValue(cachedImage);

      const { result } = renderHook(() => useCharacterImage());
      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBe('data:image/png;base64,test');
    });
  });
});
