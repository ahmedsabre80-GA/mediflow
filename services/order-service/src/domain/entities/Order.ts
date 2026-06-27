import { v4 as uuidv4 } from 'uuid';
import type { UUID, Money, OrderStatus } from '@mediflow/shared-types';
import type { OrderCreatedEvent, OrderConfirmedEvent } from '@mediflow/shared-types';
import { BusinessRuleError } from '@mediflow/shared-errors';

export interface OrderItemProps {
  drugId: UUID;
  drugName: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
}

export interface OrderProps {
  id: UUID;
  patientId: UUID;
  pharmacyId: UUID;
  offerId?: UUID;
  prescriptionId?: UUID;
  status: OrderStatus;
  items: OrderItemProps[];
  subtotal: Money;
  deliveryFee: Money;
  discountAmount: Money;
  loyaltyDiscount: Money;
  totalAmount: Money;
  deliveryAddress?: string;
  deliveryCoordinates?: { latitude: number; longitude: number };
  deliveryType: 'delivery' | 'pickup';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

export class Order {
  private readonly domainEvents: unknown[] = [];

  private constructor(private readonly props: OrderProps) {}

  static create(params: {
    patientId: UUID;
    pharmacyId: UUID;
    offerId?: UUID;
    prescriptionId?: UUID;
    items: OrderItemProps[];
    subtotal: Money;
    deliveryFee: Money;
    discountAmount?: Money;
    loyaltyDiscount?: Money;
    totalAmount: Money;
    deliveryAddress?: string;
    deliveryCoordinates?: { latitude: number; longitude: number };
    deliveryType?: 'delivery' | 'pickup';
    notes?: string;
  }): Order {
    const zero: Money = { amount: 0, currency: params.subtotal.currency };
    const order = new Order({
      id: uuidv4(),
      patientId: params.patientId,
      pharmacyId: params.pharmacyId,
      offerId: params.offerId,
      prescriptionId: params.prescriptionId,
      status: 'pending_payment',
      items: params.items,
      subtotal: params.subtotal,
      deliveryFee: params.deliveryFee,
      discountAmount: params.discountAmount ?? zero,
      loyaltyDiscount: params.loyaltyDiscount ?? zero,
      totalAmount: params.totalAmount,
      deliveryAddress: params.deliveryAddress,
      deliveryCoordinates: params.deliveryCoordinates,
      deliveryType: params.deliveryType ?? 'delivery',
      notes: params.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    order.domainEvents.push({
      eventType: 'order.created',
      orderId: order.id,
      patientId: params.patientId,
      pharmacyId: params.pharmacyId,
      totalAmount: params.totalAmount,
    } satisfies Partial<OrderCreatedEvent>);

    return order;
  }

  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }

  get id(): UUID { return this.props.id; }
  get patientId(): UUID { return this.props.patientId; }
  get pharmacyId(): UUID { return this.props.pharmacyId; }
  get status(): OrderStatus { return this.props.status; }
  get items(): OrderItemProps[] { return [...this.props.items]; }
  get totalAmount(): Money { return this.props.totalAmount; }
  get deliveryType(): string { return this.props.deliveryType; }

  confirm(): void {
    if (this.props.status !== 'pending_payment') {
      throw new BusinessRuleError(`Cannot confirm order in status ${this.props.status}`, 'ORDER_INVALID_STATE');
    }
    this.props.status = 'confirmed';
    this.props.confirmedAt = new Date();
    this.props.updatedAt = new Date();
    this.domainEvents.push({ eventType: 'order.confirmed', orderId: this.id });
  }

  markPreparing(): void {
    this.props.status = 'preparing';
    this.props.updatedAt = new Date();
  }

  markReadyForPickup(): void {
    this.props.status = 'ready_for_pickup';
    this.props.updatedAt = new Date();
  }

  markInTransit(): void {
    this.props.status = 'in_transit';
    this.props.updatedAt = new Date();
  }

  markDelivered(): void {
    this.props.status = 'delivered';
    this.props.deliveredAt = new Date();
    this.props.updatedAt = new Date();
    this.domainEvents.push({ eventType: 'order.delivered', orderId: this.id });
  }

  cancel(reason: string): void {
    const cancellableStatuses: OrderStatus[] = ['pending_payment', 'confirmed', 'preparing'];
    if (!cancellableStatuses.includes(this.props.status)) {
      throw new BusinessRuleError(`Cannot cancel order in status ${this.props.status}`, 'ORDER_INVALID_STATE');
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = reason;
    this.props.updatedAt = new Date();
    this.domainEvents.push({ eventType: 'order.cancelled', orderId: this.id, reason });
  }

  pullDomainEvents(): unknown[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  toSnapshot(): OrderProps {
    return { ...this.props, items: [...this.props.items] };
  }
}
