<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerGroup;
use Pterodactyl\Models\UserServerGroupPreference;
use Symfony\Component\HttpFoundation\Response;

class ServerGroupController extends ClientApiController
{
    public function index(ClientApiRequest $request): JsonResponse
    {
        $preferences = UserServerGroupPreference::query()
            ->where('user_id', $request->user()->id)
            ->pluck('collapsed', 'server_group_id');

        $groups = ServerGroup::query()
            ->orderBy('position')
            ->orderBy('name')
            ->get()
            ->map(fn (ServerGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'position' => $group->position,
                'collapsed' => (bool) ($preferences[$group->id] ?? false),
            ]);

        return new JsonResponse(['data' => $groups]);
    }

    public function store(ClientApiRequest $request): JsonResponse
    {
        $this->requireRootAdmin($request);

        $data = $request->validate([
            'name' => 'required|string|min:1|max:191',
        ]);

        $position = ((int) ServerGroup::query()->max('position')) + 1;
        $group = ServerGroup::query()->create([
            'name' => $data['name'],
            'position' => $position,
        ]);

        return new JsonResponse([
            'id' => $group->id,
            'name' => $group->name,
            'position' => $group->position,
            'collapsed' => false,
        ], Response::HTTP_CREATED);
    }

    public function update(ClientApiRequest $request, ServerGroup $group): JsonResponse
    {
        $this->requireRootAdmin($request);

        $data = $request->validate([
            'name' => 'sometimes|required|string|min:1|max:191',
            'position' => 'sometimes|required|integer|min:0',
        ]);

        $group->update($data);

        return new JsonResponse([
            'id' => $group->id,
            'name' => $group->name,
            'position' => $group->position,
        ]);
    }

    public function destroy(ClientApiRequest $request, ServerGroup $group): JsonResponse
    {
        $this->requireRootAdmin($request);

        $group->delete();

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    public function reorder(ClientApiRequest $request): JsonResponse
    {
        $this->requireRootAdmin($request);

        $data = $request->validate([
            'groups' => 'array',
            'groups.*.id' => 'required|integer|exists:server_groups,id',
            'groups.*.position' => 'required|integer|min:0',
            'servers' => 'array',
            'servers.*.id' => 'required|integer|exists:servers,id',
            'servers.*.groupId' => 'nullable|integer|exists:server_groups,id',
            'servers.*.position' => 'required|integer|min:0',
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['groups'] ?? [] as $group) {
                ServerGroup::query()->whereKey($group['id'])->update(['position' => $group['position']]);
            }

            foreach ($data['servers'] ?? [] as $server) {
                Server::query()->whereKey($server['id'])->update([
                    'server_group_id' => $server['groupId'] ?? null,
                    'dashboard_position' => $server['position'],
                ]);
            }
        });

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    public function collapsed(ClientApiRequest $request, ServerGroup $group): JsonResponse
    {
        $data = $request->validate([
            'collapsed' => 'required|boolean',
        ]);

        UserServerGroupPreference::query()->updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'server_group_id' => $group->id,
            ],
            ['collapsed' => $data['collapsed']]
        );

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    private function requireRootAdmin(ClientApiRequest $request): void
    {
        if (!$request->user()->root_admin) {
            throw ValidationException::withMessages([
                'root_admin' => 'Only root administrators can manage server groups.',
            ]);
        }
    }
}
