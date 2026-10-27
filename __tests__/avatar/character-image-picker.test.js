// __tests__/avatar/character-image-picker.test.js
//
// Тесты для хука useCharacterImage.js — имитация выбора изображения пользователем

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ImagePicker from 'expo-image-picker';
import { renderHook, act } from './testRenderUtils';

// Мокаем модули
// 446: с фабрикой — пустой vi.mock() делает автомок, который ПОДНИМАЕТ
// реальный граф expo (winter/runtime) и падает в vitest; фабрика не грузит.
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: { Images: 'Images', All: 'All', Videos: 'Videos' },
}));
vi.mock('../../domain/useCharacterImage', async () => {
  const actual = await vi.importActual('../../domain/useCharacterImage');
  return actual;
});

// Мокаем alertService
vi.mock('../../components/alerts/alertService', () => ({
  showRawAlert: vi.fn(() => Promise.resolve()),
}));

// Мокаем avatarCache
vi.mock('../../db/avatarCache', () => ({
  setAvatarCache: vi.fn(() => Promise.resolve()),
  getAvatarCache: vi.fn(() => Promise.resolve(null)),
}));

describe('useCharacterImage: выбор и сохранение изображения', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('выбирает изображение и сохраняет в кэш', async () => {
    // Arrange
    const mockAsset = {
      fileSize: 1024,
      base64: 'data:image/jpeg;base64,SGVsbG8=',
      mimeType: 'image/jpeg',
      uri: 'file:///test.jpg',
    };

    // Мокаем ImagePicker
    ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
    ImagePicker.launchImageLibraryAsync = vi.fn().mockResolvedValue({
      canceled: false,
      assets: [mockAsset],
    });

    const { useCharacterImage } = await import('../../domain/useCharacterImage');
    const { result } = renderHook(() => useCharacterImage());

    // Act
    const pickResult = await act(async () => {
      return await result.current.pickAndSaveCharacterImage('test-char-1');
    });

    // Assert
    expect(pickResult.success).toBe(true);
    expect(pickResult.dataUrl).toBe('data:image/jpeg;base64,SGVsbG8=');
    
    // Проверяем, что ImagePicker вызывался правильно
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      base64: true,
    });
  });

  it('показывает предупреждение если изображение слишком большое', async () => {
    // Arrange
    const mockAsset = {
      fileSize: 6 * 1024 * 1024, // 6МБ > 5МБ
      base64: 'data:image/jpeg;base64,SGVsbG8=',
      mimeType: 'image/jpeg',
      uri: 'file:///test.jpg',
    };

    ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
    ImagePicker.launchImageLibraryAsync = vi.fn().mockResolvedValue({
      canceled: false,
      assets: [mockAsset],
    });

    const { showRawAlert } = await import('../../components/alerts/alertService');
    const { useCharacterImage } = await import('../../domain/useCharacterImage');
    const { result } = renderHook(() => useCharacterImage());

    // Act
    const pickResult = await act(async () => {
      return await result.current.pickAndSaveCharacterImage('test-char-1');
    });

    // Assert
    expect(pickResult.success).toBe(false);
    expect(showRawAlert).toHaveBeenCalledWith({
      title: 'Предупреждение',
      message: expect.stringContaining('Изображение слишком большое'),
    });
  });

  it('показывает ошибку если пользователь отменяет выбор', async () => {
    // Arrange
    ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
    ImagePicker.launchImageLibraryAsync = vi.fn().mockResolvedValue({
      canceled: true,
    });

    const { useCharacterImage } = await import('../../domain/useCharacterImage');
    const { result } = renderHook(() => useCharacterImage());

    // Act
    const pickResult = await act(async () => {
      return await result.current.pickAndSaveCharacterImage('test-char-1');
    });

    // Assert
    expect(pickResult.success).toBe(false);
    expect(pickResult.error).toBe('Image selection canceled');
  });

  it('показывает ошибку если нет разрешения на галерею', async () => {
    // Arrange
    ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'denied' });

    const { useCharacterImage } = await import('../../domain/useCharacterImage');
    const { result } = renderHook(() => useCharacterImage());

    // Act
    const pickResult = await act(async () => {
      return await result.current.pickAndSaveCharacterImage('test-char-1');
    });

    // Assert
    expect(pickResult.success).toBe(false);
    expect(pickResult.error).toBe('Permission to access gallery is required');
  });

  it('принимает любые форматы изображений (PNG, GIF, WebP)', async () => {
    const formats = [
      { mimeType: 'image/png', base64: 'data:image/png;base64,iVBORw0KGgoA=' },
      { mimeType: 'image/gif', base64: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
      { mimeType: 'image/webp', base64: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=' },
    ];

    for (const format of formats) {
      // Arrange
      const mockAsset = {
        fileSize: 1024,
        base64: format.base64,
        mimeType: format.mimeType,
        uri: `file:///test.${format.mimeType.split('/')[1]}`,
      };

      ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
      ImagePicker.launchImageLibraryAsync = vi.fn().mockResolvedValue({
        canceled: false,
        assets: [mockAsset],
      });

      const { useCharacterImage } = await import('../../domain/useCharacterImage');
      const { result } = renderHook(() => useCharacterImage());

      // Act
      const pickResult = await act(async () => {
        return await result.current.pickAndSaveCharacterImage('test-char-1');
      });

      // Assert
      expect(pickResult.success).toBe(true);
      expect(pickResult.dataUrl).toBe(format.base64);
    }
  });

  it('обрабатывает изображение без base64 заголовка', async () => {
    // Arrange
    const mockAsset = {
      fileSize: 1024,
      base64: 'SGVsbG8=',  // без data: prefix
      mimeType: 'image/jpeg',
      uri: 'file:///test.jpg',
    };

    ImagePicker.requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ status: 'granted' });
    ImagePicker.launchImageLibraryAsync = vi.fn().mockResolvedValue({
      canceled: false,
      assets: [mockAsset],
    });

    const { useCharacterImage } = await import('../../domain/useCharacterImage');
    const { result } = renderHook(() => useCharacterImage());

    // Act
    const pickResult = await act(async () => {
      return await result.current.pickAndSaveCharacterImage('test-char-1');
    });

    // Assert
    expect(pickResult.success).toBe(true);
    expect(pickResult.dataUrl).toBe('data:image/jpeg;base64,SGVsbG8=');
  });
});
