// frontend/src/types/types.ts
export interface MediaItem {
    id: string;
    filename: string;
    camera_id: string;
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
        camera_name?: string; // Added camera_name to metadata
    };
}
 
export interface MediaGroup {
    date: string;
    camera_id: string;
    items: MediaItem[];
    count: number;
}

export interface CameraStatus {
    camera_id: string;
    name: string;
    status: 'active' | 'inactive';
    recording: boolean;
    resolution: {
        width: number;
        height: number;
    };
}

export interface CameraInfo {
    id: string;
    name: string;
    index: number;
    resolution: {
        width: number;
        height: number;
    };
    fps: number;
}

export interface CameraWithMedia {
    camera_id: string;
    name: string;
    total_items: number;
    date_count: number;
}