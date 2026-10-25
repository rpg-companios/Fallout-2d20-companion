// domain/useCharacterImage.js
// Хук для выбора и управления кастомными изображениями персонажей

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import * as avatarCache from '../db/avatarCache';
import { compressAvatarImage, AVATAR_LIMITS } from './characterAvatar';
import { showRawAlert } from '../components/alerts/alertService';

/**
 * Хук для работы с кастомными изображениями персонажей.
 * Обеспечивает выбор, сжатие, валидацию и сохранение изображений.
 */
export function useCharacterImage() {
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Получает URL кастомного изображения персонажа из кэша.
   * @param {string} characterId - ID персонажа
   * @returns {Promise<string|null>} - data URL изображения или null
   */
  const getCharacterImageUrl = useCallback(async (characterId) => {
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

  /**
   * Выбирает изображение из галереи и сохраняет его для персонажа.
   * @param {string} characterId - ID персонажа
   * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
   */
  const pickAndSaveCharacterImage = useCallback(async (characterId) => {
    if (!characterId) {
      return { success: false, error: 'No character ID provided' };
    }

    try {
      // Запрашиваем разрешение на доступ к галерее
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return { success: false, error: 'Permission to access gallery is required' };
      }

      // Открываем пикер изображений
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
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
      
      // Проверяем размер файла до сжатия
      if (asset.fileSize && asset.fileSize > AVATAR_LIMITS.maxBytes * 1.5) {
        Alert.alert(
          'Предупреждение',
          `Изображение слишком большое (${Math.round(asset.fileSize / 1024 / 1024)} МБ). Максимум: ${Math.round(AVATAR_LIMITS.maxBytes / 1024 / 1024)} МБ.`
        );
        return { success: false, error: 'Image too large' };
      }

      setIsLoading(true);

      // Сжимаем изображение
      const compressed = await compressAvatarImage({
        uri: asset.uri,
        base64: asset.base64,
        width: asset.width,
        height: asset.height,
        mimeType: asset.type || `image/${asset.uri.split('.').pop()}`,
      });

      // Сохраняем в кэш
      await avatarCache.saveAvatarCache(characterId, {
        data_url: compressed.dataUrl,
        mime_type: compressed.mimeType,
        md5: '',
        updated_at: Date.now(),
      });

      setIsLoading(false);
      return { success: true, dataUrl: compressed.dataUrl };
    } catch (error) {
      setIsLoading(false);
      console.error('Failed to pick and save character image:', error);
      
      let errorMessage = 'Failed to save image';
      if (error.code === 'avatar.tooLarge') {
        errorMessage = `Изображение слишком большое. Максимальный размер: ${AVATAR_LIMITS.maxBytes / 1024 / 1024} МБ`;
      } else if (error.code === 'avatar.unsupportedFormat') {
        errorMessage = `Неподдерживаемый формат. Разрешены: ${AVATAR_LIMITS.allowedMimeTypes.join(', ')}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showRawAlert('Ошибка', errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    getCharacterImageUrl,
    pickAndSaveCharacterImage,
    isLoading,
  };
}

export default useCharacterImage;
