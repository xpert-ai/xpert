# Develop Integrations

Use [ngrok](https://ngrok.com/) to provide api for callback local service from integration provider's server.

```bash
ngrok http http://localhost:3000

❤️  ngrok? We're hiring https://ngrok.com/careers

Session Status                online
Account                       meta.digital.cloud@gmail.com (Plan: Free)
Update                        update available (version 3.19.0, Ctrl-U to update)
Version                       3.16.0                                             
Region                        Japan (jp)                                         
Latency                       46ms                                               
Web Interface                 http://127.0.0.1:4040                              
Forwarding                    https://27ec-112-86-152-76.ngrok-free.app -> http://localhost:3000
                                                                                                
Connections                   ttl     opn     rt1     rt5     p50     p90                       
                              3       0       0.01    0.01    5.14    5.91                      
                                                                                                
HTTP Requests                                                                                   
-------------                                                                                   
                                                                                                
16:41:55.345 CST POST /api/lark/webhook/93500bd2-07a1-4a65-bffb-c47d800bc6c4 200 OK             
```
