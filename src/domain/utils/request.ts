import needle from 'needle';

export function postReq(url: string, data: any, headers:any){
    return needle('post', url, data, headers)
}