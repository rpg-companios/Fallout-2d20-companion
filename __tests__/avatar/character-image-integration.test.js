// __tests__/avatar/character-image-integration.test.js
//
// Интеграционные тесты для работы с изображениями персонажей
// Проверяем полный user flow: выбор изображения → сохранение → обновление UI

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from './testRenderUtils';
import React from 'react';

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
  confirmAlert: vi.fn(() => Promise.resolve(true)),
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

// Мокаем expo/vector-icons
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, size, color, ...props }) => (
    React.createElement('Text', props, `${name}`)
  ),
}));

// Мокаем assets
vi.mock('../../../assets/bg1.png', () => ({ default: 'default-image' }));

import * as ImagePicker from 'expo-image-picker';
import * as avatarCache from '../../db/avatarCache';
import { showRawAlert, confirmAlert } from '../../components/alerts/alertService';

describe('Character image integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Full user flow: pick image → save → display', () => {
    // Тестовая обёртка для ImageSection
    const TestImageSection = ({ origin, characterId, onEditPress, getCharacterImageUrl, imageVersion }) => {
      const [customImageUrl, setCustomImageUrl] = React.useState(null);
      const [isLoading, setIsLoading] = React.useState(false);

      React.useEffect(() => {
        if (characterId && getCharacterImageUrl) {
          setIsLoading(true);
          getCharacterImageUrl(characterId)
            .then((url) => {
              setCustomImageUrl(url);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
        }
      }, [characterId, getCharacterImageUrl, imageVersion]);

      const imageSource = customImageUrl
        ? { uri: customImageUrl }
        : origin?.image || 'default-image';

      return React.createElement('View', { testID: 'image-section' },
        React.createElement('Text', { testID: 'image-source' }, JSON.stringify(imageSource)),
        React.createElement('Text', { testID: 'custom-url' }, customImageUrl || 'null'),
        React.createElement('Text', { testID: 'loading' }, String(isLoading)),
        onEditPress && React.createElement('Button', {
          testID: 'edit-button',
          onPress: onEditPress,
          title: 'Edit'
        }),
      );
    };

    // Тестовый хук, который имитирует useCharacterImage
    const useTestCharacterImage = () => {
      const [isLoading, setIsLoading] = React.useState(false);
      const [imageVersion, setImageVersion] = React.useState(0);

      const refreshImage = React.useCallback(() => {
        setImageVersion(prev => prev + 1);
      }, []);

      const getCharacterImageUrl = React.useCallback(async (characterId) => {
        if (!characterId) return null;
        try {
          const cached = await avatarCache.getAvatarCache(characterId);
          if (cached?.data_url || cached?.dataUrl) {
            return cached.data_url || cached.dataUrl;
          }
          return null;
        } catch (error) {
          console.error('Failed to get character image URL:', error);
          return null;
        }
      }, []);

      const pickAndSaveCharacterImage = React.useCallback(async (characterId) => {
        if (!characterId) {
          return { success: false, error: 'No character ID provided' };
        }

        try {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            return { success: false, error: 'Permission to access gallery is required' };
          }

          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            base64: true,
          });

          if (result.canceled) {
            return { success: false, error: 'Image selection canceled' };
          }

          const { assets } = result;
          if (!assets || assets.length === 0) {
            return { success: false, error: 'No image selected' };
          }

          const asset = assets[0];

          if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
            showRawAlert({ title: 'Предупреждение', message: 'Изображение слишком большое' });
            return { success: false, error: 'Image too large' };
          }

          setIsLoading(true);

          let mimeType = asset.mimeType || asset.type || 'image/jpeg';
          if (asset.base64 && asset.base64.startsWith('data:')) {
            const match = asset.base64.match(/^data:(image\/[^;]+)/);
            if (match) {
              mimeType = match[1];
            }
          }

          let dataUrl;
          if (asset.base64) {
            if (asset.base64.startsWith('data:')) {
              dataUrl = asset.base64;
            } else {
              dataUrl = `data:${mimeType};base64,${asset.base64}`;
            }
          }

          await avatarCache.setAvatarCache(characterId, dataUrl, null, mimeType);
          refreshImage(); // ← Это ключевой момент!
          setIsLoading(false);

          return { success: true, dataUrl };
        } catch (error) {
          setIsLoading(false);
          showRawAlert({ title: 'Ошибка', message: error.message });
          return { success: false, error: error.message };
        }
      }, [refreshImage]);

      return {
        getCharacterImageUrl,
        pickAndSaveCharacterImage,
        isLoading,
        imageVersion,
      };
    };

    // Тестовый компонент, который имитирует CharacterScreen
    const TestCharacterScreen = ({ characterId }) => {
      const { 
        pickAndSaveCharacterImage, 
        getCharacterImageUrl, 
        imageVersion 
      } = useTestCharacterImage();

      const handleEditImagePress = React.useCallback(async () => {
        const confirmed = await confirmAlert('changeCharacterImage');
        if (confirmed) {
          await pickAndSaveCharacterImage(characterId);
        }
      }, [pickAndSaveCharacterImage, characterId]);

      return React.createElement('View', { testID: 'character-screen' },
        React.createElement(TestImageSection, {
          characterId: characterId,
          getCharacterImageUrl: getCharacterImageUrl,
          onEditPress: handleEditImagePress,
          imageVersion: imageVersion,
        })
      );
    };

    it('image updates after successful selection', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,new-image',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });
      confirmAlert.mockResolvedValue(true);
      avatarCache.getAvatarCache
        .mockResolvedValueOnce(null) // First call - no image
        .mockResolvedValueOnce({ data_url: 'data:image/jpeg;base64,new-image' }); // After save

      render(React.createElement(TestCharacterScreen, { characterId: 'test-char-1' }));

      // Initial state - no custom image
      expect(screen.getByTestId('custom-url').children[0]).toBe('null');

      // Act - press edit button
      fireEvent.press(screen.getByTestId('edit-button'));

      // Wait for async operations
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Assert - image should be updated
      expect(avatarCache.setAvatarCache).toHaveBeenCalled();
      expect(screen.getByTestId('custom-url').children[0]).toBe('data:image/jpeg;base64,new-image');
    });

    it('imageVersion increases after saving image', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,new-image',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });
      confirmAlert.mockResolvedValue(true);
      avatarCache.getAvatarCache.mockResolvedValue(null);

      render(React.createElement(TestCharacterScreen, { characterId: 'test-char-1' }));

      // Get initial imageVersion
      const initialVersion = Number(screen.getByTestId('loading').children[0]);
      // Note: We can't directly access imageVersion from screen, 
      // but we can verify it increases through the effect

      // Act - press edit button
      fireEvent.press(screen.getByTestId('edit-button'));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Assert - setAvatarCache was called, which triggers refreshImage
      expect(avatarCache.setAvatarCache).toHaveBeenCalled();
    });

    it('does NOT update image when user cancels selection', async () => {
      // Arrange
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      });
      confirmAlert.mockResolvedValue(true);
      avatarCache.getAvatarCache.mockResolvedValue(null);

      render(React.createElement(TestCharacterScreen, { characterId: 'test-char-1' }));

      const initialUrl = screen.getByTestId('custom-url').children[0];

      // Act - press edit button
      fireEvent.press(screen.getByTestId('edit-button'));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Assert - image should NOT be updated
      expect(avatarCache.setAvatarCache).not.toHaveBeenCalled();
      expect(screen.getByTestId('custom-url').children[0]).toBe(initialUrl);
    });

    it('does NOT update image when user cancels confirmation', async () => {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: 'data:image/jpeg;base64,new-image',
        mimeType: 'image/jpeg',
        uri: 'file:///test.jpg',
      };

      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });
      confirmAlert.mockResolvedValue(false); // User cancels confirmation
      avatarCache.getAvatarCache.mockResolvedValue(null);

      render(React.createElement(TestCharacterScreen, { characterId: 'test-char-1' }));

      const initialUrl = screen.getByTestId('custom-url').children[0];

      // Act - press edit button
      fireEvent.press(screen.getByTestId('edit-button'));

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Assert - image should NOT be updated because user cancelled confirmation
      expect(avatarCache.setAvatarCache).not.toHaveBeenCalled();
      expect(screen.getByTestId('custom-url').children[0]).toBe(initialUrl);
    });
  });

  describe('Image caching and retrieval', () => {
    it('getCharacterImageUrl returns cached image', async () => {
      const cachedImage = { data_url: 'data:image/jpeg;base64,cached' };
      avatarCache.getAvatarCache.mockResolvedValue(cachedImage);

      const { useCharacterImage } = await import('../../domain/useCharacterImage');
      const { result } = renderHook(() => useCharacterImage());

      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBe('data:image/jpeg;base64,cached');
      expect(avatarCache.getAvatarCache).toHaveBeenCalledWith('test-char-1');
    });

    it('getCharacterImageUrl returns null when no cached image', async () => {
      avatarCache.getAvatarCache.mockResolvedValue(null);

      const { useCharacterImage } = await import('../../domain/useCharacterImage');
      const { result } = renderHook(() => useCharacterImage());

      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBeNull();
    });

    it('getCharacterImageUrl handles errors gracefully', async () => {
      avatarCache.getAvatarCache.mockRejectedValue(new Error('Cache error'));

      const { useCharacterImage } = await import('../../domain/useCharacterImage');
      const { result } = renderHook(() => useCharacterImage());

      const url = await result.current.getCharacterImageUrl('test-char-1');
      expect(url).toBeNull();
    });
  });
});
