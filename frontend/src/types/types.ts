// frontend/src/types/types.ts
export interface MediaItem {
    id: string;
    filename: string;
    type: 'photo' | 'video';
    date: string;
    thumbnail: string;
    url: string;
    metadata: {
        resolution: {
            width: number;
            height: number;
        };
        created_at: string;
        size: number;
        duration?: number;
        fps?: number;
    };
}

export interface MediaGroup {
    date: string;
    items: MediaItem[];
    count: number;
}

export interface CameraStatus {
    status: 'active' | 'inactive';
    recording: boolean;
    resolution: {
        width: number;
        height: number;
    };
}
