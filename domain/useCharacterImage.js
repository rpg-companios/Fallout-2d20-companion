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
    console.log('[useCharacterImage] pickAndSaveCharacterImage: start, characterId:', characterId);
    if (!characterId) {
      console.log('[useCharacterImage] pickAndSaveCharacterImage: no characterId');
      return { success: false, error: 'No character ID provided' };
    }

    try {
      console.log('[useCharacterImage] pickAndSaveCharacterImage: requesting permissions');
      // Запрашиваем разрешение на доступ к галерее
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[useCharacterImage] pickAndSaveCharacterImage: permission status:', status);
      if (status !== 'granted') {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: permission denied');
        return { success: false, error: 'Permission to access gallery is required' };
      }

      console.log('[useCharacterImage] pickAndSaveCharacterImage: launching image picker');
      // Открываем пикер изображений
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        base64: true,
      });
      console.log('[useCharacterImage] pickAndSaveCharacterImage: picker result:', result.canceled ? 'canceled' : 'success');

      if (result.canceled) {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: user canceled selection');
        return { success: false, error: 'Image selection canceled' };
      }

      const { assets } = result;
      console.log('[useCharacterImage] pickAndSaveCharacterImage: assets count:', assets?.length || 0);
      if (!assets || assets.length === 0) {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: no assets');
        return { success: false, error: 'No image selected' };
      }

      const asset = assets[0];
      console.log('[useCharacterImage] pickAndSaveCharacterImage: asset size:', asset.fileSize);
      
      // Проверяем размер файла до сжатия
      if (asset.fileSize && asset.fileSize > AVATAR_LIMITS.maxBytes * 1.5) {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: image too large');
        showRawAlert(
          'Предупреждение',
          `Изображение слишком большое (${Math.round(asset.fileSize / 1024 / 1024)} МБ). Максимум: ${Math.round(AVATAR_LIMITS.maxBytes / 1024 / 1024)} МБ.`
        );
        return { success: false, error: 'Image too large' };
      }

      console.log('[useCharacterImage] pickAndSaveCharacterImage: compressing image');
      setIsLoading(true);

      // Определяем MIME-тип: пробуем asset.mimeType, затем asset.type, затем расширение URI
      // В web-сборке expo-image-picker asset.type может быть просто "image"
      let mimeType = asset.mimeType || asset.type;
      
      // Если mimeType это просто "image", пробуем определить из URI или base64
      if (mimeType === 'image' || !mimeType) {
        if (asset.uri && asset.uri.startsWith('blob:')) {
          // В web blob URI не содержит расширения, пробуем определить по base64
          if (asset.base64) {
            const base64Header = asset.base64.substring(0, 100);
            if (base64Header.includes('image/png')) {
              mimeType = 'image/png';
            } else if (base64Header.includes('image/jpeg') || base64Header.includes('image/jpg')) {
              mimeType = 'image/jpeg';
            } else if (base64Header.includes('image/gif')) {
              mimeType = 'image/gif';
            } else {
              mimeType = 'image/jpeg'; // по умолчанию
            }
          } else {
            mimeType = 'image/jpeg'; // по умолчанию для blob без base64
          }
        } else if (asset.uri?.match(/\.([^.]+)$/)?.[1]) {
          mimeType = `image/${asset.uri.match(/\.([^.]+)$/)[1].toLowerCase()}`;
        } else {
          mimeType = 'image/jpeg';
        }
      }
      
      console.log('[useCharacterImage] pickAndSaveCharacterImage: detected mimeType:', mimeType);
      
      const compressed = await compressAvatarImage({
        uri: asset.uri,
        base64: asset.base64,
        width: asset.width,
        height: asset.height,
        mimeType: mimeType,
      });
      console.log('[useCharacterImage] pickAndSaveCharacterImage: compressed, size:', compressed.bytes);

      // Сохраняем в кэш
      console.log('[useCharacterImage] pickAndSaveCharacterImage: saving to cache');
      await avatarCache.saveAvatarCache(characterId, {
        data_url: compressed.dataUrl,
        mime_type: compressed.mimeType,
        md5: '',
        updated_at: Date.now(),
      });

      setIsLoading(false);
      console.log('[useCharacterImage] pickAndSaveCharacterImage: success');
      return { success: true, dataUrl: compressed.dataUrl };
    } catch (error) {
      setIsLoading(false);
      console.error('[useCharacterImage] pickAndSaveCharacterImage: error:', error);
      
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
