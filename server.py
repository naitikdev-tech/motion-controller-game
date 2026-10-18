import os
import json
import socket
from aiohttp import web

rooms = {}
public_path = os.path.join(os.path.dirname(__file__), 'public')

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

async def handle_index(request):
    return web.FileResponse(os.path.join(public_path, 'index.html'))

async def handle_controller(request):
    return web.FileResponse(os.path.join(public_path, 'controller.html'))

async def handle_info(request):
    return web.json_response({'ip': get_local_ip(), 'port': 8000})

async def ws_handler(request):
    ws = web.WebSocketResponse(heartbeat=10)
    await ws.prepare(request)

    current_room = None
    client_role = None
    player_id = None

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                action = data.get('type')

                if action == 'join':
                    current_room = str(data.get('room', '1001'))
                    client_role = data.get('role', 'controller')

                    if current_room not in rooms:
                        rooms[current_room] = {'host': None, 'controllers': {}}

                    if client_role == 'host':
                        rooms[current_room]['host'] = ws
                        await ws.send_json({
                            'type': 'host_ready',
                            'room': current_room,
                            'ip': get_local_ip()
                        })
                    else:
                        room_data = rooms[current_room]
                        active_ctrls = {w: p for w, p in room_data['controllers'].items() if not w.closed}
                        room_data['controllers'] = active_ctrls

                        pids = list(active_ctrls.values())
                        player_id = 1 if 1 not in pids else 2
                        room_data['controllers'][ws] = player_id

                        await ws.send_json({
                            'type': 'joined',
                            'playerId': player_id,
                            'room': current_room
                        })

                        host_ws = room_data.get('host')
                        if host_ws and not host_ws.closed:
                            await host_ws.send_json({
                                'type': 'player_joined',
                                'playerId': player_id
                            })

                elif action == 'input' and current_room in rooms:
                    host_ws = rooms[current_room].get('host')
                    if host_ws and not host_ws.closed:
                        data['playerId'] = player_id
                        await host_ws.send_json(data)

                    ping_time = data.get('pingTime')
                    if ping_time is not None:
                        await ws.send_json({
                            'type': 'pong',
                            'pingTime': ping_time
                        })

                elif action == 'vibrate' and current_room in rooms:
                    target_pid = data.get('playerId')
                    for ctrl_ws, pid in rooms[current_room]['controllers'].items():
                        if pid == target_pid and not ctrl_ws.closed:
                            await ctrl_ws.send_json(data)

                elif action == 'ping':
                    await ws.send_json({
                        'type': 'pong',
                        'time': data.get('time')
                    })

    finally:
        if current_room and current_room in rooms:
            if client_role == 'host':
                for ctrl_ws in list(rooms[current_room]['controllers'].keys()):
                    if not ctrl_ws.closed:
                        await ctrl_ws.send_json({'type': 'host_disconnected'})
                rooms.pop(current_room, None)
            elif client_role == 'controller':
                rooms[current_room]['controllers'].pop(ws, None)
                host_ws = rooms[current_room].get('host')
                if host_ws and not host_ws.closed:
                    await host_ws.send_json({
                        'type': 'player_left',
                        'playerId': player_id
                    })

    return ws

app = web.Application()
app.router.add_get('/', handle_index)
app.router.add_get('/controller', handle_controller)
app.router.add_get('/ws', ws_handler)
app.router.add_get('/api/info', handle_info)
app.router.add_static('/', path=public_path)

if __name__ == '__main__':
    ip = get_local_ip()
    port = 8000
    print('==============================================')
    print('   MOTION CONTROLLER GAME SERVER RUNNING')
    print('==============================================')
    print(f'Laptop Game:  http://localhost:{port}/')
    print(f'Phone Controller: http://{ip}:{port}/controller.html')
    print('==============================================')
    web.run_app(app, host='0.0.0.0', port=port)
