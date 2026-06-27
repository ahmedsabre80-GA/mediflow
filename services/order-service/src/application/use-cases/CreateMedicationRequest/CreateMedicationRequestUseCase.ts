import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { UUID } from '@mediflow/shared-types';
import { BusinessRuleError, ValidationError } from '@mediflow/shared-errors';

const Schema = z.object({
  patientId: z.string().uuid(),
  items: z.array(z.object({
    drugId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    notes: z.string().optional(),
  })).min(1).max(20),
  prescriptionId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isEmergency: z.boolean().default(false),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  notes: z.string().max(500).optional(),
});

type Input = z.infer<typeof Schema>;

interface MedicationRequestResult {
  requestId: UUID;
  status: string;
  searchRadiusKm: number;
  estimatedResponseTime: string;
}

export class CreateMedicationRequestUseCase {
  constructor(
    private readonly requestRepository: IRequestRepository,
    private readonly inventoryPort: IInventoryPort,
    private readonly gisPort: IGisPort,
    private readonly productCatalogPort: IProductCatalogPort,
    private readonly cascadeQueue: ICascadeQueue,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(input: Input): Promise<MedicationRequestResult> {
    const parsed = Schema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })));
    }
    const data = parsed.data;

    // Business rule: max 5 open requests per patient
    const activeCount = await this.requestRepository.countActiveByPatient(data.patientId);
    if (activeCount >= 5) {
      throw new BusinessRuleError('Maximum 5 active requests allowed', 'ORDER_MAX_REQUESTS');
    }

    // Check prescription requirement for each drug
    for (const item of data.items) {
      const drug = await this.productCatalogPort.getDrug(item.drugId);
      if (drug.requiresPrescription && !data.prescriptionId) {
        throw new BusinessRuleError(
          `Drug "${drug.genericName}" requires a valid prescription`,
          'ORDER_RX_REQUIRED',
        );
      }
    }

    // Get ranked pharmacies from GIS
    const rankedPharmacies = await this.gisPort.rankPharmacies({
      latitude: data.latitude,
      longitude: data.longitude,
      radiusKm: 5,
      drugIds: data.items.map((i) => i.drugId),
    });

    if (rankedPharmacies.length === 0) {
      throw new BusinessRuleError('No pharmacies available in your area', 'ORDER_NO_PHARMACY');
    }

    // Create request record
    const requestId = uuidv4();
    await this.requestRepository.create({
      id: requestId,
      patientId: data.patientId,
      prescriptionId: data.prescriptionId,
      isEmergency: data.isEmergency,
      latitude: data.latitude,
      longitude: data.longitude,
      items: data.items,
      status: 'searching',
      rankedPharmacies: rankedPharmacies.map((p) => p.pharmacyId),
    });

    // Enqueue cascade job
    const timeoutSeconds = data.isEmergency ? 120 : 300;
    await this.cascadeQueue.enqueue({
      requestId,
      pharmacies: rankedPharmacies,
      timeoutSeconds,
      currentRank: 0,
    });

    return {
      requestId,
      status: 'searching',
      searchRadiusKm: 5,
      estimatedResponseTime: data.isEmergency ? '1-2 minutes' : '2-5 minutes',
    };
  }
}

// Port interfaces
interface IRequestRepository {
  create(data: unknown): Promise<void>;
  countActiveByPatient(patientId: UUID): Promise<number>;
}
interface IInventoryPort {
  checkStock(pharmacyId: UUID, drugIds: UUID[]): Promise<{ drugId: UUID; available: boolean }[]>;
}
interface IGisPort {
  rankPharmacies(params: { latitude: number; longitude: number; radiusKm: number; drugIds: UUID[] }): Promise<{ pharmacyId: UUID; distanceKm: number }[]>;
}
interface IProductCatalogPort {
  getDrug(drugId: UUID): Promise<{ requiresPrescription: boolean; genericName: string }>;
}
interface ICascadeQueue {
  enqueue(job: unknown): Promise<void>;
}
interface IEventBus {
  publish(topic: string, event: unknown): Promise<void>;
}
