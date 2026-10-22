// components/SettingRuntimeBoundary.js
// Предохранитель вокруг кода сеттинга.
//
// Сеттинг — сторонний плагин: он приходит пакетом, исполняется в общем JS-контексте
// и может упасть на рендере. Без этого предохранителя одна ошибка в компоненте
// сеттинга разворачивала весь App Error и приложение становилось непригодным,
// пока не сбросишь данные. Здесь падение остаётся локальным: хост сообщает
// наверх, экран сеттинга просто исчезает, движок продолжает работать.

import React from 'react';

export default class SettingRuntimeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    try {
      this.props.onError?.({ error, info });
    } catch {
      // Обработчик сбоя не должен ронять приложение повторно.
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
