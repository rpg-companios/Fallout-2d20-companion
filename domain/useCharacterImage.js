// domain/useCharacterImage.js
// Хук для выбора и управления кастомными изображениями персонажей

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import * as avatarCache from '../db/avatarCache';
import { AVATAR_LIMITS, validateAvatarDataUrl, base64ByteLength } from './characterAvatar';
import { showRawAlert } from '../components/alerts/alertService';

/**
 * Хук для работы с кастомными изображениями персонажей.
 * Обеспечивает выбор, валидацию и сохранение изображений.
 */
export function useCharacterImage() {
  const [isLoading, setIsLoading] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);

  /**
   * Обновляет версию изображения для принудительного перерисовки
   */
  const refreshImage = useCallback(() => {
    setImageVersion(prev => prev + 1);
  }, []);

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
        allowsEditing: false,
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
      
      // Проверяем размер файла
      if (asset.fileSize && asset.fileSize > AVATAR_LIMITS.maxBytes) {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: image too large');
        showRawAlert({
          title: 'Предупреждение',
          message: `Изображение слишком большое (${Math.round(asset.fileSize / 1024 / 1024)} МБ). Максимальный размер: ${Math.round(AVATAR_LIMITS.maxBytes / 1024 / 1024)} МБ.`
        });
        return { success: false, error: 'Image too large' };
      }

      console.log('[useCharacterImage] pickAndSaveCharacterImage: processing image');
      setIsLoading(true);

      // Определяем MIME-тип
      let mimeType = asset.mimeType || asset.type || 'image/jpeg';
      
      // Пробуем определить из base64 data URL
      if (asset.base64 && asset.base64.startsWith('data:')) {
        const match = asset.base64.match(/^data:(image\/[^;]+)/);
        if (match) {
          mimeType = match[1];
        }
      }
      
      console.log('[useCharacterImage] pickAndSaveCharacterImage: detected mimeType:', mimeType);
      
      // Формируем data URL
      let dataUrl;
      if (asset.base64) {
        if (asset.base64.startsWith('data:')) {
          dataUrl = asset.base64;
        } else {
          dataUrl = `data:${mimeType};base64,${asset.base64}`;
        }
      } else if (asset.uri) {
        // Если нет base64, но есть uri - это не должно произойти с base64: true
        console.log('[useCharacterImage] pickAndSaveCharacterImage: no base64, using uri');
        return { success: false, error: 'No base64 data available' };
      }
      
      // Валидируем data URL
      const validation = validateAvatarDataUrl(dataUrl);
      if (!validation.ok) {
        console.log('[useCharacterImage] pickAndSaveCharacterImage: validation failed:', validation.reason);
        let errorMessage = 'Невалидное изображение';
        if (validation.reason === 'avatar.tooLarge') {
          errorMessage = `Изображение слишком большое. Максимальный размер: ${AVATAR_LIMITS.maxBytes / 1024 / 1024} МБ`;
        }
        showRawAlert({ title: 'Ошибка', message: errorMessage });
        setIsLoading(false);
        return { success: false, error: errorMessage };
      }
      
      // Используем MIME-тип из валидации, если он есть
      if (validation.mimeType) {
        mimeType = validation.mimeType;
      }

      // Сохраняем в кэш как есть
      console.log('[useCharacterImage] pickAndSaveCharacterImage: saving to cache');
      await avatarCache.setAvatarCache(characterId, dataUrl, null, mimeType);

      // Обновляем версию изображения для принудительного перерисовки
      refreshImage();

      setIsLoading(false);
      console.log('[useCharacterImage] pickAndSaveCharacterImage: success');
      return { success: true, dataUrl };
    } catch (error) {
      setIsLoading(false);
      console.error('[useCharacterImage] pickAndSaveCharacterImage: error:', error);
      
      let errorMessage = 'Не удалось сохранить изображение';
      if (error.message) {
        errorMessage = error.message;
      }
      
      showRawAlert({ title: 'Ошибка', message: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  return {
    getCharacterImageUrl,
    pickAndSaveCharacterImage,
    isLoading,
    imageVersion,
    refreshImage,
  };
}

export default useCharacterImage;
