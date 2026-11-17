import { IntentReviewMiddleware, IntentReviewView } from './review-view'
import { Module } from '@nestjs/common'
import { CustomerIntentFeedback } from './feedback'
import { CustomerIntentNode } from './node'
import { CustomerIntentProvider } from './provider'

@Module({
  providers: [
    IntentReviewMiddleware,
    IntentReviewView,
    CustomerIntentFeedback,
    CustomerIntentNode,
    CustomerIntentProvider
  ],
  exports: [CustomerIntentNode, CustomerIntentProvider, IntentReviewView, IntentReviewMiddleware]
})
export class CustomerIntentModule {}
