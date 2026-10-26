// domain/useCharacterImage.js
// Хук для выбора и управления кастомными изображениями персонажей

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import * as avatarCache from '../db/avatarCache';
import { AVATAR_LIMITS, validateAvatarDataUrl, base64ByteLength } from './characterAvatar';
import { showRawAlert } from '../components/alerts/alertService';
// 446: отладка аватаров ушла в гейт трассировки (__fallout.on(['avatar']); в проде — тишина.
import { debugLog } from '../src/debug/falloutDebug';

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
      debugLog('avatar.error', { step: 'Failed to get character image URL:', error: String(error?.message ?? error) });
      return null;
    }
  }, []);

  /**
   * Выбирает изображение из галереи и сохраняет его для персонажа.
   * @param {string} characterId - ID персонажа
   * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
   */
  const pickAndSaveCharacterImage = useCallback(async (characterId) => {
    debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: start, characterId:', value: (characterId) });
    if (!characterId) {
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: no characterId' });
      return { success: false, error: 'No character ID provided' };
    }

    try {
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: requesting permissions' });
      // Запрашиваем разрешение на доступ к галерее
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: permission status:', value: (status) });
      if (status !== 'granted') {
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: permission denied' });
        return { success: false, error: 'Permission to access gallery is required' };
      }

      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: launching image picker' });
      // Открываем пикер изображений
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        base64: true,
      });
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: picker result:', value: (result.canceled ? 'canceled' : 'success') });

      if (result.canceled) {
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: user canceled selection' });
        return { success: false, error: 'Image selection canceled' };
      }

      const { assets } = result;
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: assets count:', value: (assets?.length || 0) });
      if (!assets || assets.length === 0) {
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: no assets' });
        return { success: false, error: 'No image selected' };
      }

      const asset = assets[0];
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: asset size:', value: (asset.fileSize) });
      
      // Проверяем размер файла
      if (asset.fileSize && asset.fileSize > AVATAR_LIMITS.maxBytes) {
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: image too large' });
        showRawAlert({
          title: 'Предупреждение',
          message: `Изображение слишком большое (${Math.round(asset.fileSize / 1024 / 1024)} МБ). Максимальный размер: ${Math.round(AVATAR_LIMITS.maxBytes / 1024 / 1024)} МБ.`
        });
        return { success: false, error: 'Image too large' };
      }

      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: processing image' });
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
      
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: detected mimeType:', value: (mimeType) });
      
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
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: no base64, using uri' });
        return { success: false, error: 'No base64 data available' };
      }
      
      // Валидируем data URL
      const validation = validateAvatarDataUrl(dataUrl);
      if (!validation.ok) {
        debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: validation failed:', value: (validation.reason) });
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
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: saving to cache' });
      await avatarCache.setAvatarCache(characterId, dataUrl, null, mimeType);

      // Обновляем версию изображения для принудительного перерисовки
      refreshImage();

      setIsLoading(false);
      debugLog('avatar.useCharacterImage', { step: 'pickAndSaveCharacterImage: success' });
      return { success: true, dataUrl };
    } catch (error) {
      setIsLoading(false);
      debugLog('avatar.error', { step: '[useCharacterImage] pickAndSaveCharacterImage: error:', error: String(error?.message ?? error) });
      
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
