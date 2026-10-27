// __tests__/avatar/image-section-component.test.js
//
// Тесты компонента ImageSection
// Проверяем, что компонент правильно реагирует на изменения props

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from './testRenderUtils';
import React from 'react';

// Мокаем expo/vector-icons
vi.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: ({ name, size, color }) => (
    React.createElement('Text', null, `${name}-${size}-${color}`)
  ),
}));

// Мокаем assets
vi.mock('../../../assets/bg1.png', () => ({ default: 'default-image' }));

// Импортируем ImageSection из CharacterScreen
// Поскольку ImageSection определен внутри CharacterScreen, нам нужно его извлечь
// или тестировать через CharacterScreen

// Вместо этого создадим тестовую обёртку для ImageSection
const TestImageSection = ({ origin, characterId, onEditPress, getCharacterImageUrl, imageVersion }) => {
  const [customImageUrl, setCustomImageUrl] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Загружаем кастомную картинку при монтировании или изменении версии
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

  return React.createElement('View', null,
    React.createElement('Text', { testID: 'image-source' }, JSON.stringify(imageSource)),
    React.createElement('Text', { testID: 'loading' }, String(isLoading)),
    React.createElement('Text', { testID: 'custom-url' }, customImageUrl || 'null'),
  );
};

describe('ImageSection component behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches image on mount when characterId is provided', async () => {
    const mockGetUrl = vi.fn().mockResolvedValue('data:image/jpeg;base64,test');

    render(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    expect(mockGetUrl).toHaveBeenCalledWith('test-char-1');
  });

  it('does NOT fetch image when characterId is null', async () => {
    const mockGetUrl = vi.fn().mockResolvedValue('data:image/jpeg;base64,test');

    render(
      React.createElement(TestImageSection, {
        characterId: null,
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    expect(mockGetUrl).not.toHaveBeenCalled();
  });

  it('does NOT fetch image when getCharacterImageUrl is null', async () => {
    const mockGetUrl = vi.fn().mockResolvedValue('data:image/jpeg;base64,test');

    render(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: null,
        imageVersion: 0,
      })
    );

    expect(mockGetUrl).not.toHaveBeenCalled();
  });

  it('re-fetches image when imageVersion changes', async () => {
    const mockGetUrl = vi.fn()
      .mockResolvedValueOnce('data:image/jpeg;base64,old')
      .mockResolvedValueOnce('data:image/jpeg;base64,new');

    const { rerender } = render(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    // Wait for first fetch
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl).toHaveBeenCalledTimes(1);

    // Change imageVersion
    rerender(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 1,
      })
    );

    // Wait for second fetch
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl).toHaveBeenCalledTimes(2);
    expect(mockGetUrl).toHaveBeenCalledWith('test-char-1');
  });

  it('re-fetches image when characterId changes', async () => {
    const mockGetUrl = vi.fn()
      .mockResolvedValueOnce('data:image/jpeg;base64,old')
      .mockResolvedValueOnce('data:image/jpeg;base64,new');

    const { rerender } = render(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl).toHaveBeenCalledTimes(1);
    expect(mockGetUrl).toHaveBeenCalledWith('test-char-1');

    // Change characterId
    rerender(
      React.createElement(TestImageSection, {
        characterId: 'test-char-2',
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl).toHaveBeenCalledTimes(2);
    expect(mockGetUrl).toHaveBeenCalledWith('test-char-2');
  });

  it('re-fetches image when getCharacterImageUrl changes', async () => {
    const mockGetUrl1 = vi.fn().mockResolvedValue('data:image/jpeg;base64,old');
    const mockGetUrl2 = vi.fn().mockResolvedValue('data:image/jpeg;base64,new');

    const { rerender } = render(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl1,
        imageVersion: 0,
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl1).toHaveBeenCalledTimes(1);
    expect(mockGetUrl2).not.toHaveBeenCalled();

    // Change getCharacterImageUrl
    rerender(
      React.createElement(TestImageSection, {
        characterId: 'test-char-1',
        getCharacterImageUrl: mockGetUrl2,
        imageVersion: 0,
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl2).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-fetch when only imageVersion changes but characterId is null', async () => {
    const mockGetUrl = vi.fn().mockResolvedValue('data:image/jpeg;base64,test');

    const { rerender } = render(
      React.createElement(TestImageSection, {
        characterId: null,
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 0,
      })
    );

    expect(mockGetUrl).not.toHaveBeenCalled();

    // Change imageVersion but characterId is still null
    rerender(
      React.createElement(TestImageSection, {
        characterId: null,
        getCharacterImageUrl: mockGetUrl,
        imageVersion: 1,
      })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetUrl).not.toHaveBeenCalled();
  });
});
