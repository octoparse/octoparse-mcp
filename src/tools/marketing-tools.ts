import { z } from 'zod';
import { OctoparseApi } from '../api/octoparse.js';
import { OctoparseApiError } from '../api/types.js';
import messages from '../config/messages.js';
import { ToolDefinition } from './tool-definition.js';

async function resolveApiInstance(
  apiOrFactory: OctoparseApi | (() => Promise<OctoparseApi | undefined>) | undefined
): Promise<OctoparseApi | undefined> {
  if (typeof apiOrFactory === 'function') {
    return apiOrFactory();
  }
  return apiOrFactory;
}

interface MarketingToolError {
  success: false;
  error: string;
  message: string;
  recoverable?: boolean;
  requiresUserAction?: boolean;
  [key: string]: unknown;
}

function buildMarketingToolError(
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
): MarketingToolError {
  return {
    success: false,
    error,
    message,
    ...extra
  };
}

function getRedeemCodeErrorDetails(error: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
  requiresUserAction: boolean;
} | null {
  const errorCode =
    error instanceof OctoparseApiError
      ? error.code ?? error.message
      : error instanceof Error
        ? error.message
        : '';

  switch (errorCode) {
    case 'CouponCodeError':
      return {
        code: errorCode,
        message: 'Coupon code does not exist, or the mapped template/resource cannot be found.',
        recoverable: true,
        requiresUserAction: true
      };
    case 'CouponBindingLimitation':
      return {
        code: errorCode,
        message: 'This coupon or resource cannot be granted because the quota is full or the user claim limit has been reached.',
        recoverable: false,
        requiresUserAction: true
      };
    case 'CouponExpired':
      return {
        code: errorCode,
        message: 'This coupon template has expired and can no longer be claimed.',
        recoverable: false,
        requiresUserAction: true
      };
    case 'CouponCodeLevelNotAllowed':
      return {
        code: errorCode,
        message: 'This coupon code is not available for the current account level.',
        recoverable: false,
        requiresUserAction: true
      };
    default:
      return null;
  }
}

const redeemCouponCodeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Coupon code cannot be empty')
    .max(100, 'Coupon code is too long')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code contains invalid characters')
    .describe('Required. The user coupon/promotion code to redeem, for example `RESOURCE_TMPL_01`.')
});

export const redeemCouponCodeTool: ToolDefinition = {
  name: 'redeem_coupon_code',
  title: messages.tools.redeemCouponCode.title,
  description: messages.tools.redeemCouponCode.description,
  requiresAuth: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: redeemCouponCodeInputSchema,
  handler: async (input, apiOrFactory) => {
    const api = await resolveApiInstance(apiOrFactory);
    if (!api) {
      throw new Error('API instance required');
    }

    try {
      const result = await api.redeemCouponCode(input.code);

      if (!result.isSuccess) {
        return buildMarketingToolError(
          'coupon_redeem_failed',
          'Coupon redemption finished without granting a reward.',
          {
            recoverable: false,
            requiresUserAction: true,
            couponCode: input.code,
            displayMessage: '❌ This coupon code has already been used or is invalid. Check the coupon code and try again, or contact support.'
          }
        );
      }

      return {
        success: true,
        couponCode: input.code,
        status: 'redeemed' as const,
        userCode: result.userCode ?? input.code,
        grantTargetType: result.grantTargetType ?? null,
        resourceType: result.resourceType ?? null,
        rewardExpireTime: result.rewardExpireTime ?? null,
        coupon: result.coupon ?? null,
        resourceCount: result.resourceCount ?? null,
        isSuccess: result.isSuccess,
        message: 'Coupon code redeemed successfully.',
        displayMessage: `🎁 Coupon code redeemed! You've earned ${result.resourceCount} extra free rows on top of your weekly quota. Happy scraping!`
      };
    } catch (error) {
      const knownError = getRedeemCodeErrorDetails(error);
      if (knownError) {
        return buildMarketingToolError(knownError.code, knownError.message, {
          recoverable: knownError.recoverable,
          requiresUserAction: knownError.requiresUserAction,
          couponCode: input.code,
          displayMessage: '❌ This code has already been used or is invalid. Check the code and try again, or contact support.'
        });
      }

      return buildMarketingToolError(
        'coupon_redeem_failed',
        error instanceof Error ? error.message : 'Coupon redemption failed.',
        {
          recoverable: true,
          requiresUserAction: false,
          couponCode: input.code,
          displayMessage: '❌ This code has already been used or is invalid. Check the code and try again, or contact support.'
        }
      );
    }
  }
};

export const allTools: ToolDefinition[] = [redeemCouponCodeTool];
