<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class ServerGroup extends Model
{
    protected $table = 'server_groups';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    public static array $validationRules = [
        'name' => 'required|string|min:1|max:191',
        'position' => 'integer|min:0',
    ];

    protected $casts = [
        'position' => 'integer',
        self::CREATED_AT => 'datetime',
        self::UPDATED_AT => 'datetime',
    ];

    public function getRouteKeyName(): string
    {
        return 'id';
    }

    public function servers(): HasMany
    {
        return $this->hasMany(Server::class, 'server_group_id');
    }
}
