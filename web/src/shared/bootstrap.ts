import { useEffect, useState } from 'react';

export type TemplateWidgetPayload = {
  isLoading?: boolean;
  useTemplatePromptTemplate?: string;
  cards?: Array<{
    templateName?: string;
    displayName?: string;
    shortDescription?: string;
    imageUrl?: string;
    templateRef?: {
      templateId?: number;
      templateName?: string;
      displayName?: string;
    } | null;
    priceLabel?: string;
    popularityLikes?: number;
    lastModifiedLabel?: string;
    executionMode?: string;
    note?: string;
    iconKey?: string;
    downloadUrl?: string;
    sourceOptions?: unknown;
    inputSchema?: unknown;
    outputSchema?: unknown;
  }>;
  banner?: {
    summary?: string;
    message?: string;
    hint?: string;
  } | null;
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
  structuredContent?: {
    recommendedTemplateName?: string | null;
  };
};

type TemplateStructuredTemplate = {
  templateName?: string;
  displayName?: string;
  shortDescription?: string;
  imageUrl?: string;
  templateRef?: {
    templateId?: number;
    templateName?: string;
    displayName?: string;
  };
  executionMode?: string;
  popularityLikes?: number;
  priceLabel?: string;
  lastModifiedLabel?: string;
  downloadUrl?: string;
  sourceOptions?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

type TemplateMetaCard = TemplateStructuredTemplate & {
  note?: string;
  iconKey?: string;
};

export type TaskWidgetPayload = {
  startTaskPromptTemplate?: string;
  stopTaskPromptTemplate?: string;
  rows?: Array<{
    taskId?: string;
    taskName?: string;
    taskStatusLabel?: string;
    taskDescription?: string;
    author?: string;
    creationUserName?: string;
    version?: string;
    statusTone?: 'running' | 'stopped' | 'completed' | 'failed' | 'unknown';
  }>;
  pagination?: {
    page?: number;
    size?: number;
    total?: number;
    totalPages?: number;
  };
  filtersApplied?: Record<string, unknown>;
};

declare global {
  interface Window {
    openai?: {
      toolOutput?: unknown;
      toolResponseMetadata?: unknown;
      state?: {
        toolOutput?: unknown;
        toolResponseMetadata?: unknown;
      };
    };
    __OCTOPARSE_WIDGET_KIND__?: 'search-templates' | 'search-tasks';
  }
}

const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

function createTemplateWaitingState(): TemplateWidgetPayload {
  return {
    isLoading: true,
    cards: [],
    banner: null,
    pagination: {
      page: 1,
      pageSize: 0,
      total: 0
    },
    structuredContent: {
      recommendedTemplateName: null
    }
  };
}

function createTaskFallback(): TaskWidgetPayload {
  return {
    rows: [
      {
        taskId: 'task-preview',
        taskName: 'Sample Cloud Task',
        taskStatusLabel: 'Completed',
        taskDescription: 'Fallback preview while waiting for host tool output.',
        author: 'Octoparse',
        creationUserName: 'demo',
        version: '1.0.0',
        statusTone: 'completed'
      }
    ],
    startTaskPromptTemplate: 'Start task {taskId}.',
    stopTaskPromptTemplate: 'Stop task {taskId}.',
    pagination: {
      page: 1,
      size: 1,
      total: 1,
      totalPages: 1
    },
    filtersApplied: {}
  };
}

function readToolOutput(): unknown {
  return window.openai?.toolOutput ?? window.openai?.state?.toolOutput;
}

function readToolResponseMetadata(): unknown {
  return window.openai?.toolResponseMetadata ?? window.openai?.state?.toolResponseMetadata;
}

function inferTemplateIcon(displayName: string | undefined, templateName: string | undefined): string {
  const haystack = `${displayName || ''} ${templateName || ''}`.toLowerCase();

  if (haystack.includes('google')) return 'search-engine';
  if (haystack.includes('map')) return 'maps';
  if (haystack.includes('social')) return 'social-media';
  if (haystack.includes('contact')) return 'contact';
  return 'generic-template';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTemplateRef(value: unknown):
  | {
    templateId?: number;
    templateName?: string;
    displayName?: string;
  }
  | null {
  if (!isRecord(value)) {
    return null;
  }

  const normalized = {
    templateId: typeof value.templateId === 'number' ? value.templateId : undefined,
    templateName: typeof value.templateName === 'string' ? value.templateName : undefined,
    displayName: typeof value.displayName === 'string' ? value.displayName : undefined
  };

  return normalized.templateId !== undefined ||
    normalized.templateName !== undefined ||
    normalized.displayName !== undefined
    ? normalized
    : null;
}

function toTemplateCard(template: TemplateStructuredTemplate) {
  return {
    templateName: template.templateName,
    displayName: template.displayName || template.templateName,
    shortDescription: template.shortDescription,
    imageUrl: template.imageUrl,
    templateRef: normalizeTemplateRef(template.templateRef),
    executionMode: template.executionMode,
    popularityLikes: template.popularityLikes,
    priceLabel: template.priceLabel,
    lastModifiedLabel: template.lastModifiedLabel,
    iconKey: inferTemplateIcon(template.displayName || template.templateName, template.templateName),
    downloadUrl: template.downloadUrl,
    sourceOptions: template.sourceOptions,
    inputSchema: template.inputSchema,
    outputSchema: template.outputSchema
  };
}

function normalizeRecommendedTemplateName(
  structuredContent: Record<string, unknown> | undefined
): TemplateWidgetPayload['structuredContent'] {
  return {
    recommendedTemplateName:
      typeof structuredContent?.recommendedTemplateName === 'string'
        ? structuredContent.recommendedTemplateName
        : null
  };
}

function normalizeBanner(value: unknown): TemplateWidgetPayload['banner'] {
  if (!isRecord(value)) {
    return null;
  }

  return {
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    hint: typeof value.hint === 'string' ? value.hint : undefined
  };
}

function normalizePagination(
  value: unknown,
  cardCount: number
): NonNullable<TemplateWidgetPayload['pagination']> {
  if (!isRecord(value)) {
    return {
      page: 1,
      pageSize: cardCount,
      total: cardCount
    };
  }

  return {
    page: typeof value.page === 'number' ? value.page : 1,
    pageSize: typeof value.pageSize === 'number' ? value.pageSize : cardCount,
    total: typeof value.total === 'number' ? value.total : cardCount
  };
}

function createDegradedTemplatePayload(
  payload: Record<string, unknown>,
  structuredContent: Record<string, unknown> | undefined,
  meta: Record<string, unknown> | undefined
): TemplateWidgetPayload {
  return {
    isLoading: false,
    ...(typeof meta?.useTemplatePromptTemplate === 'string'
      ? { useTemplatePromptTemplate: meta.useTemplatePromptTemplate }
      : {}),
    cards: [],
    banner: normalizeBanner(meta?.banner),
    pagination: normalizePagination(meta?.pagination, 0),
    structuredContent: normalizeRecommendedTemplateName(structuredContent)
  };
}

function fromStructuredTemplatePayload(
  payload: Record<string, unknown>
): TemplateWidgetPayload | null {
  const templates = payload.templates;
  if (!Array.isArray(templates)) {
    return null;
  }

  const cards = templates
    .filter((item): item is TemplateStructuredTemplate => isRecord(item))
    .map((template) => toTemplateCard(template));

  return {
    isLoading: false,
    cards,
    pagination: {
      page: typeof payload.page === 'number' ? payload.page : 1,
      pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : cards.length,
      total: typeof payload.totalMatchingTemplates === 'number'
        ? payload.totalMatchingTemplates
        : cards.length
    },
    structuredContent: normalizeRecommendedTemplateName(payload)
  };
}

function fromMetaTemplatePayload(
  meta: Record<string, unknown>,
  structuredContent: Record<string, unknown> | undefined
): TemplateWidgetPayload | null {
  if (!Array.isArray(meta.cards)) {
    return null;
  }

  const cards = meta.cards
    .filter((item): item is TemplateMetaCard => isRecord(item))
    .map((template) => ({
      ...toTemplateCard(template),
      note: typeof template.note === 'string' ? template.note : undefined,
      iconKey: typeof template.iconKey === 'string' ? template.iconKey : undefined
    }));

  const pagination = normalizePagination(meta.pagination, cards.length);
  const banner = normalizeBanner(meta.banner);
  return {
    isLoading: false,
    ...(typeof meta.useTemplatePromptTemplate === 'string'
      ? { useTemplatePromptTemplate: meta.useTemplatePromptTemplate }
      : {}),
    cards,
    banner,
    pagination,
    structuredContent: normalizeRecommendedTemplateName(structuredContent)
  };
}

function unwrapToolPayload<T>(kind: 'search-templates' | 'search-tasks', fallback: T): T {
  const toolOutput = readToolOutput();
  if (!toolOutput || typeof toolOutput !== 'object') {
    return fallback;
  }

  const payload = toolOutput as Record<string, unknown>;
  const metadata = readToolResponseMetadata();
  const meta = isRecord(metadata)
    ? metadata
    : isRecord(payload._meta)
      ? payload._meta
      : undefined;
  const structuredContent = isRecord(payload.structuredContent)
    ? payload.structuredContent
    : undefined;

  if (kind === 'search-templates') {
    if (meta) {
      const normalizedFromMetadata = fromMetaTemplatePayload(meta, structuredContent);
      if (normalizedFromMetadata) {
        return normalizedFromMetadata as T;
      }
    }
    const normalizedFromTopLevel = fromStructuredTemplatePayload(payload);
    if (normalizedFromTopLevel) {
      return normalizedFromTopLevel as T;
    }
    if (structuredContent) {
      const normalized = fromStructuredTemplatePayload(structuredContent);
      if (normalized) {
        return normalized as T;
      }
    }
    return createDegradedTemplatePayload(payload, structuredContent, meta) as T;
  }

  if (kind === 'search-tasks') {
    if (meta && Array.isArray(meta.rows)) {
      return {
        ...(meta as object)
      } as T;
    }
    if (Array.isArray(payload.rows)) {
      return payload as T;
    }
  }

  return fallback;
}

export function getTemplateWidgetPayload(): TemplateWidgetPayload {
  return unwrapToolPayload('search-templates', createTemplateWaitingState());
}

export function getTaskWidgetPayload(): TaskWidgetPayload {
  return unwrapToolPayload('search-tasks', createTaskFallback());
}

export function useTemplateWidgetPayload(): TemplateWidgetPayload {
  const [payload, setPayload] = useState<TemplateWidgetPayload>(() => getTemplateWidgetPayload());

  useEffect(() => {
    const syncPayload = () => {
      setPayload(getTemplateWidgetPayload());
    };

    syncPayload();
    window.addEventListener(SET_GLOBALS_EVENT_TYPE, syncPayload, {
      passive: true
    });

    return () => {
      window.removeEventListener(SET_GLOBALS_EVENT_TYPE, syncPayload);
    };
  }, []);

  return payload;
}

export function useTaskWidgetPayload(): TaskWidgetPayload {
  const [payload, setPayload] = useState<TaskWidgetPayload>(() => getTaskWidgetPayload());

  useEffect(() => {
    const syncPayload = () => {
      setPayload(getTaskWidgetPayload());
    };

    syncPayload();
    window.addEventListener(SET_GLOBALS_EVENT_TYPE, syncPayload, {
      passive: true
    });

    return () => {
      window.removeEventListener(SET_GLOBALS_EVENT_TYPE, syncPayload);
    };
  }, []);

  return payload;
}
