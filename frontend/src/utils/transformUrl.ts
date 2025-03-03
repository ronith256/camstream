import { API_BASE_URL } from "../services/api"

const MEDIA_API_URL = `${API_BASE_URL.replace('/api', '')}`
export const transformUrl = (url: string) => {
    if(!url.includes('http')) {
        return `${MEDIA_API_URL}${url}`;
    }
    return url;
}